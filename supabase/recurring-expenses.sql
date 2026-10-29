begin;
-- Retain existing menu keys and each user's own ledger isolation.
do $migration$
declare f text;
begin
 f:=pg_get_functiondef('billflow_private.project_payload(jsonb,text[])'::regprocedure);
 if position('''recurringExpenses''' in f)=0 then
  f:=replace(f,'''budgets'',case','''recurringExpenses'',case when ''budgets''=any(menus) then coalesce(p->''recurringExpenses'',''[]'') else ''[]''::jsonb end, ''budgets'',case');execute f;
 end if;
 f:=pg_get_functiondef('billflow_private.save_workspace(jsonb,bigint)'::regprocedure);
 f:=replace(f,'allowed:=allowed||array[''budgets'']','allowed:=allowed||array[''budgets'',''recurringExpenses'']');
 f:=replace(f,'''employees'',''budgets'',''documentSources''] loop','''employees'',''budgets'',''recurringExpenses'',''documentSources''] loop');execute f;
end $migration$;

create function billflow_private.recurring_due(r jsonb,d date) returns boolean language sql immutable security invoker set search_path='' as $$
 select d>=(r->>'startDate')::date and (coalesce(r->>'paidThrough','')='' or d>(r->>'paidThrough')::date)
 and (r->>'frequency'='monthly' or extract(month from d)=extract(month from (r->>'startDate')::date))
 and extract(day from d)=least(extract(day from (r->>'startDate')::date),extract(day from (date_trunc('month',d)+interval '1 month - 1 day')));
$$;
create function billflow_private.validate_recurring() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; d date;
begin
 if not(new.payload?'recurringExpenses') then return new;end if;
 if jsonb_typeof(new.payload->'recurringExpenses') is distinct from 'array' or jsonb_array_length(new.payload->'recurringExpenses')>500 then raise exception 'INVALID_RECURRING';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(new.payload->'recurringExpenses') x)<>jsonb_array_length(new.payload->'recurringExpenses') then raise exception 'DUPLICATE_RECURRING';end if;
 for r in select value from jsonb_array_elements(new.payload->'recurringExpenses') loop
  if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'id') is distinct from 'string' or length(r->>'id') not between 1 and 100
   or jsonb_typeof(r->'title') is distinct from 'string' or length(trim(r->>'title')) not between 1 and 150
   or coalesce(r->>'frequency','') not in ('monthly','yearly') or coalesce(r->>'startDate','') !~ '^\d{4}-\d{2}-\d{2}$'
   or jsonb_typeof(r->'amount') is distinct from 'number' or coalesce(r->>'amount','') !~ '^[0-9]+$' or (r->>'amount')::numeric>100000000000000
   or jsonb_typeof(r->'enabled') is distinct from 'boolean' or jsonb_typeof(r->'note') is distinct from 'string' or length(r->>'note')>500
   or jsonb_typeof(r->'remindDays') is distinct from 'array' then raise exception 'INVALID_RECURRING';end if;
  d:=(r->>'startDate')::date;
  if d<'2000-01-01'::date or d>'2100-12-31'::date or to_char(d,'YYYY-MM-DD')<>r->>'startDate' then raise exception 'INVALID_RECURRING_DATE';end if;
  if r?'paidThrough' and (coalesce(r->>'paidThrough','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((r->>'paidThrough')::date,'YYYY-MM-DD')<>r->>'paidThrough') then raise exception 'INVALID_PAID_DATE';end if;
  if jsonb_array_length(r->'remindDays') not between 1 and 4 or exists(select 1 from jsonb_array_elements(r->'remindDays') x where x not in ('3'::jsonb,'7'::jsonb,'15'::jsonb,'30'::jsonb)) or (select count(distinct x) from jsonb_array_elements(r->'remindDays') x)<>jsonb_array_length(r->'remindDays') then raise exception 'INVALID_REMINDER_DAYS';end if;
 end loop;
 return new;
end $$;
create trigger billflow_recurring_validate before insert or update of payload on public.billflow_ledgers for each row execute function billflow_private.validate_recurring();
alter table public.billflow_line_outbox drop constraint billflow_line_outbox_action_check;
alter table public.billflow_line_outbox add constraint billflow_line_outbox_action_check check(action in ('create','update','delete','test','reminder'));

create function billflow_private.enqueue_recurring(p_now timestamptz default now()) returns integer language plpgsql security definer set search_path='' as $$
declare local_day date:=(p_now at time zone 'Asia/Bangkok')::date; inserted integer;
begin
 -- Cancel queued notices after edit, delete, pause, or marking this occurrence paid.
 update public.billflow_line_outbox q set status='cancelled',last_error='การตั้งค่ารายจ่ายประจำเปลี่ยนแล้ว'
 where q.action='reminder' and q.status in ('pending','processing') and not exists(
  select 1 from public.billflow_ledgers l cross join lateral jsonb_array_elements(coalesce(l.payload->'recurringExpenses','[]')) r
  where l.owner=q.owner and r=q.entry->'schedule' and r->>'enabled'='true'
  and billflow_private.recurring_due(r,(q.entry->>'due')::date));
 if (p_now at time zone 'Asia/Bangkok')::time<'09:00'::time then return 0;end if;
 insert into public.billflow_line_outbox(owner,revision,entry_id,action,entry,business,accounts,group_id)
 select l.owner,0,'recurring:'||(r->>'id')||':'||(local_day+days.n)::text||':'||days.n,'reminder',
 jsonb_build_object('schedule',r,'title',r->>'title','amount',r->'amount','frequency',r->>'frequency','due',(local_day+days.n)::text,'days',days.n),l.payload->>'business','[]',c.group_id
 from public.billflow_ledgers l join public.billflow_line_settings c on c.owner=l.owner and c.enabled and c.group_id is not null
 cross join lateral jsonb_array_elements(coalesce(l.payload->'recurringExpenses','[]')) r
 cross join lateral (select value::int n from jsonb_array_elements_text(r->'remindDays')) days
 where r->>'enabled'='true' and billflow_private.recurring_due(r,local_day+days.n)
 on conflict(owner,revision,entry_id,action) do nothing;
 get diagnostics inserted=row_count;return inserted;
end $$;
-- Reuse the existing minute worker; the producer also runs when no financial entries change.
do $migration$
declare f text;
begin
 f:=pg_get_functiondef('private.billflow_line_tick()'::regprocedure);
 if position('enqueue_recurring' in f)=0 then f:=replace(f,E'begin\n',E'begin\n perform billflow_private.enqueue_recurring();\n');execute f;end if;
end $migration$;
-- Service-only recheck before delivery prevents sending an obsolete queued notice.
create function public.billflow_recurring_notice_valid(p_id uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.billflow_line_outbox q join public.billflow_ledgers l on l.owner=q.owner
 cross join lateral jsonb_array_elements(coalesce(l.payload->'recurringExpenses','[]')) r
 where q.id=p_id and q.action='reminder' and q.status='processing' and r=q.entry->'schedule' and r->>'enabled'='true' and billflow_private.recurring_due(r,(q.entry->>'due')::date));
$$;
revoke all on function billflow_private.recurring_due(jsonb,date),billflow_private.validate_recurring(),billflow_private.enqueue_recurring(timestamptz),public.billflow_recurring_notice_valid(uuid) from public,anon,authenticated;
grant execute on function public.billflow_recurring_notice_valid(uuid) to service_role;
commit;
