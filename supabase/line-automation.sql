begin;
-- Extends the installed manual test schema. Owner authorized the disclosed
-- fields for the already-paired admin group; activation is a separate step.
alter table public.billflow_line_outbox drop constraint billflow_line_outbox_action_check;
alter table public.billflow_line_outbox drop constraint billflow_line_outbox_entry_check;
alter table public.billflow_line_outbox drop constraint billflow_line_outbox_business_check;
alter table public.billflow_line_outbox drop constraint billflow_line_outbox_accounts_check;
alter table public.billflow_line_outbox add constraint billflow_line_outbox_action_check check(action in ('create','update','delete','test'));
alter table public.billflow_line_outbox add constraint billflow_line_outbox_entry_check check(jsonb_typeof(entry)='object');
alter table public.billflow_line_outbox add constraint billflow_line_outbox_accounts_check check(jsonb_typeof(accounts)='array');
alter table public.billflow_line_settings add column enabled_at timestamptz;
alter table public.billflow_line_settings add constraint billflow_line_types_check check(types <@ array['income','expense','transfer']::text[]);

create function private.billflow_line_enqueue() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg public.billflow_line_settings; changed jsonb; operation text; account_snapshot jsonb;
begin
 select * into cfg from public.billflow_line_settings where owner=new.owner;
 if not found or not cfg.enabled or cfg.group_id is null or cfg.enabled_at is null then return new;end if;
 -- First save and explicit backup restores establish a baseline. Never replay history.
 if tg_op='INSERT' or new.payload#>>'{audit,0,text}'='กู้คืนข้อมูลจากไฟล์สำรอง' then return new;end if;
 for changed,operation in
  select coalesce(n.value,o.value),case when o.value is null then 'create' when n.value is null then 'delete' else 'update' end
  from jsonb_array_elements(new.payload->'entries') n
  full join jsonb_array_elements(old.payload->'entries') o on n.value->>'id'=o.value->>'id'
  where n.value is distinct from o.value
 loop
  if not (changed->>'type'=any(cfg.types)) then continue;end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a->>'id','name',a->>'name')),'[]'::jsonb)
  into account_snapshot from jsonb_array_elements(case when operation='delete' then old.payload->'accounts' else new.payload->'accounts' end) a
  where a->>'id' in (changed->>'account',changed->>'to');
  -- Store only the fields actually used by the approved notification template.
  insert into public.billflow_line_outbox(owner,revision,entry_id,action,entry,business,accounts,group_id)
  values(new.owner,new.revision,changed->>'id',operation,
   jsonb_build_object('id',changed->>'id','type',changed->>'type','date',changed->>'date','documentNo',changed->>'documentNo','title',changed->>'title','amount',changed->'amount','account',changed->>'account','to',changed->>'to'),
   new.payload->>'business',account_snapshot,cfg.group_id) on conflict do nothing;
 end loop;
 return new;
end $$;
create trigger billflow_line_changes after insert or update on public.billflow_ledgers for each row execute function private.billflow_line_enqueue();

create or replace function public.billflow_line_claim(p_owner uuid default null) returns setof public.billflow_line_outbox language sql security invoker set search_path='' as $$
 update public.billflow_line_outbox q set status='processing',claimed_at=now(),attempts=attempts+1
 where q.id in (select x.id from public.billflow_line_outbox x join public.billflow_line_settings c on c.owner=x.owner and (c.enabled or x.action='test') and c.group_id=x.group_id
 where (p_owner is null or x.owner=p_owner) and x.attempts<8 and x.available_at<=now() and (x.status='pending' or (x.status='processing' and x.claimed_at<now()-interval '2 minutes')) order by x.created_at limit 5 for update of x skip locked) returning q.*;
$$;
select vault.create_secret(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'billflow_line_worker_key');
create function public.billflow_line_check_worker(p_key text) returns boolean language sql security definer set search_path='' as $$
 select length(p_key)=64 and p_key=(select decrypted_secret from vault.decrypted_secrets where name='billflow_line_worker_key');
$$;
create function private.billflow_line_tick() returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.billflow_line_outbox q join public.billflow_line_settings c on c.owner=q.owner and (c.enabled or q.action='test') and c.group_id=q.group_id where q.attempts<8 and q.available_at<=now() and (q.status='pending' or (q.status='processing' and q.claimed_at<now()-interval '2 minutes'))) then return;end if;
 perform net.http_post(url:='https://maxqjstknhwhymsugutz.supabase.co/functions/v1/billflow-line',headers:=jsonb_build_object('Content-Type','application/json','x-billflow-worker',(select decrypted_secret from vault.decrypted_secrets where name='billflow_line_worker_key')),body:='{"action":"process"}'::jsonb,timeout_milliseconds:=60000);
end $$;
select cron.schedule('billflow-line-outbox','* * * * *','select private.billflow_line_tick();');
revoke all on function private.billflow_line_enqueue(),private.billflow_line_tick() from public,anon,authenticated;
revoke all on function public.billflow_line_check_worker(text),public.billflow_line_claim(uuid) from public,anon,authenticated;
grant execute on function public.billflow_line_check_worker(text),public.billflow_line_claim(uuid) to service_role;
commit;
