begin;
-- Keep the new accounting document private to existing financial-menu permissions.
do $migration$
declare f text;
begin
 f:=pg_get_functiondef('billflow_private.project_payload(jsonb,text[])'::regprocedure);
 if position('''bookkeeping''' in f)=0 then
  if position('''audit'',''[]''::jsonb' in f)=0 then raise exception 'PROJECTION_CHANGED';end if;
  f:=replace(f,'''audit'',''[]''::jsonb','''bookkeeping'',case when menus&&array[''overview'',''entries'',''cashbook'',''accounts'',''debts'',''budgets'',''reports''] then p->''bookkeeping'' else null end,''audit'',''[]''::jsonb');execute f;
 end if;
 f:=pg_get_functiondef('billflow_private.save_workspace(jsonb,bigint)'::regprocedure);
 if position('''bookkeeping''' in f)=0 then
  if position('''accounts'',''accountHolders'']' in f)=0 then raise exception 'SAVE_CHANGED';end if;
  f:=replace(f,'allowed:=allowed||array[''accounts'',''accountHolders'']','allowed:=allowed||array[''accounts'',''accountHolders'',''bookkeeping'']');
  f:=replace(f,'''business'',''accounts'',''accountHolders'',''entries''','''business'',''accounts'',''accountHolders'',''bookkeeping'',''entries''');
  f:=replace(f,'if k=''recurringExpenseNames''','if k=''bookkeeping'' and (new_payload->k is null or new_payload->k=''null''::jsonb) then continue;end if; if k=''recurringExpenseNames''');execute f;
 end if;
end $migration$;
create function billflow_private.validate_bookkeeping() returns trigger language plpgsql security invoker set search_path='' as $$
declare b jsonb; a jsonb; j jsonb; l jsonb; item jsonb; original jsonb; codes text[]; cashcodes text[]; dr numeric; cr numeric;
begin
 -- An older open browser must not erase accounting records it does not know about.
 if tg_op='UPDATE' and old.payload?'bookkeeping' and not(new.payload?'bookkeeping') then new.payload:=jsonb_set(new.payload,'{bookkeeping}',old.payload->'bookkeeping');end if;
 if not(new.payload?'bookkeeping') or new.payload->'bookkeeping'='null'::jsonb then
  if tg_op='UPDATE' and old.payload->'bookkeeping' is not null and old.payload->'bookkeeping'<>'null'::jsonb then raise exception 'BOOKKEEPING_REMOVAL_FORBIDDEN';end if;return new;
 end if;
 b:=new.payload->'bookkeeping';
 if jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(b->'chart') is distinct from 'array' or jsonb_array_length(b->'chart') not between 1 and 2000 or jsonb_typeof(b->'journals') is distinct from 'array' or jsonb_typeof(b->'allocations') is distinct from 'object' then raise exception 'INVALID_BOOKKEEPING';end if;
 if coalesce(b->>'openingDate','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((b->>'openingDate')::date,'YYYY-MM-DD')<>b->>'openingDate' then raise exception 'INVALID_OPENING_DATE';end if;
 if exists(select 1 from jsonb_array_elements(new.payload->'accounts') x where (x->>'opening')::numeric<>0) and exists(select 1 from jsonb_array_elements(new.payload->'entries') x where x->>'date'<b->>'openingDate') then raise exception 'OPENING_AFTER_ENTRIES';end if;
 select array_agg(x->>'code') into codes from jsonb_array_elements(b->'chart') x;
 if cardinality(codes)<>(select count(distinct x) from unnest(codes) x) or not('390000'=any(codes)) then raise exception 'DUPLICATE_ACCOUNT_CODE';end if;
 for a in select value from jsonb_array_elements(b->'chart') loop
  if coalesce(a->>'code','') !~ '^\d{4,10}$' or jsonb_typeof(a->'name') is distinct from 'string' or length(trim(a->>'name')) not between 1 and 150 or coalesce(a->>'group','') not in ('asset','liability','equity','income','expense') or coalesce(a->>'normal','') not in ('debit','credit') or jsonb_typeof(a->'section') is distinct from 'string' or length(a->>'section')>150 or jsonb_typeof(a->'active') is distinct from 'boolean' then raise exception 'INVALID_CHART_ACCOUNT';end if;
  if a?'cashFlow' and a->'cashFlow'<>'null'::jsonb and coalesce(a->>'cashFlow','') not in ('operating','investing','financing') then raise exception 'INVALID_CASH_FLOW_CLASS';end if;
  if coalesce(a->>'cashAccountId','')<>'' and a->>'group'<>'asset' then raise exception 'INVALID_CASH_ACCOUNT';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(b->'chart') x where coalesce(x->>'cashAccountId','')<>'')<>(select count(distinct x->>'cashAccountId') from jsonb_array_elements(b->'chart') x where coalesce(x->>'cashAccountId','')<>'') then raise exception 'DUPLICATE_CASH_MAPPING';end if;
 select coalesce(array_agg(x->>'code'),'{}') into cashcodes from jsonb_array_elements(b->'chart') x where coalesce(x->>'cashAccountId','')<>'';
 for item in select value from jsonb_each(b->'allocations') loop
  if jsonb_typeof(item) is distinct from 'object' or not coalesce(item->>'code'=any(codes),false) or item->>'code'=any(cashcodes) then raise exception 'INVALID_ALLOCATION';end if;
  if exists(select 1 from jsonb_each(item) x where x.key not in ('code','department','project','reference','source','note') or jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>500) then raise exception 'INVALID_ALLOCATION_DETAIL';end if;
 end loop;
 if jsonb_array_length(b->'journals')<>(select count(distinct x->>'id') from jsonb_array_elements(b->'journals') x) or jsonb_array_length(b->'journals')<>(select count(distinct upper(x->>'no')) from jsonb_array_elements(b->'journals') x) then raise exception 'DUPLICATE_JOURNAL';end if;
 for j in select value from jsonb_array_elements(b->'journals') loop
  if jsonb_typeof(j->'id') is distinct from 'string' or length(j->>'id') not between 1 and 100 or jsonb_typeof(j->'no') is distinct from 'string' or length(trim(j->>'no')) not between 1 and 64 or coalesce(j->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((j->>'date')::date,'YYYY-MM-DD')<>j->>'date' or coalesce(j->>'kind','') not in ('sales','purchase','general','adjustment','closing') or jsonb_typeof(j->'memo') is distinct from 'string' or length(trim(j->>'memo')) not between 1 and 500 or jsonb_typeof(j->'lines') is distinct from 'array' or jsonb_array_length(j->'lines') not between 2 and 100 then raise exception 'INVALID_JOURNAL';end if;
  if exists(select 1 from unnest(array['reference','source','contact']) k where jsonb_typeof(j->k) is distinct from 'string' or length(j->>k)>500) then raise exception 'INVALID_JOURNAL_SOURCE';end if;
  dr:=0;cr:=0;
  for l in select value from jsonb_array_elements(j->'lines') loop
   if not coalesce(l->>'code'=any(codes),false) or l->>'code'=any(cashcodes) or coalesce(l->>'debit','') !~ '^\d+$' or coalesce(l->>'credit','') !~ '^\d+$' or (l->>'debit')::numeric>100000000000000 or (l->>'credit')::numeric>100000000000000 or ((l->>'debit')::numeric>0)=((l->>'credit')::numeric>0) or jsonb_typeof(l->'detail') is distinct from 'string' or length(l->>'detail')>500 then raise exception 'INVALID_JOURNAL_LINE';end if;
   dr:=dr+(l->>'debit')::numeric;cr:=cr+(l->>'credit')::numeric;
  end loop;
  if dr<>cr or dr<=0 or dr>9007199254740991 then raise exception 'UNBALANCED_JOURNAL';end if;
  if j?'file' and j->'file'<>'null'::jsonb and (coalesce(j->'file'->>'id','') !~ '^[a-f0-9-]{36}$' or jsonb_typeof(j->'file'->'name') is distinct from 'string') then raise exception 'INVALID_JOURNAL_FILE';end if;
  if coalesce(j->>'reversalOf','')<>'' then
   select value into original from jsonb_array_elements(b->'journals') where value->>'id'=j->>'reversalOf';
   if original is null or original?'reversalOf' or j->>'date'<original->>'date' or jsonb_array_length(j->'lines')<>jsonb_array_length(original->'lines') or (select count(*) from jsonb_array_elements(b->'journals') x where x->>'reversalOf'=j->>'reversalOf')<>1 then raise exception 'INVALID_REVERSAL';end if;
   if exists(select 1 from jsonb_array_elements(j->'lines') with ordinality x(value,i) where x.value->>'code'<>original->'lines'->(i::integer-1)->>'code' or x.value->>'debit'<>original->'lines'->(i::integer-1)->>'credit' or x.value->>'credit'<>original->'lines'->(i::integer-1)->>'debit') then raise exception 'INVALID_REVERSAL_LINES';end if;
  end if;
 end loop;
 if tg_op='UPDATE' and old.payload->'bookkeeping' is not null then
  for a in select value from jsonb_array_elements(coalesce(old.payload->'bookkeeping'->'chart','[]'::jsonb)) loop
   if not exists(select 1 from jsonb_array_elements(b->'chart') x where x->>'code'=a->>'code' and x->>'group'=a->>'group' and x->>'normal'=a->>'normal' and coalesce(x->>'cashAccountId','')=coalesce(a->>'cashAccountId','')) then raise exception 'CHART_STRUCTURE_IMMUTABLE';end if;
  end loop;
  for j in select value from jsonb_array_elements(coalesce(old.payload->'bookkeeping'->'journals','[]'::jsonb)) loop
   if not exists(select 1 from jsonb_array_elements(b->'journals') x where x=j) then raise exception 'POSTED_JOURNAL_IMMUTABLE';end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function billflow_private.validate_bookkeeping() from public,anon,authenticated;
create trigger billflow_validate_bookkeeping before insert or update of payload on public.billflow_ledgers for each row execute function billflow_private.validate_bookkeeping();
commit;
