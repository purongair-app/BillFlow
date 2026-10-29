begin;
do $migration$
declare f text;
begin
 f:=pg_get_functiondef('billflow_private.project_payload(jsonb,text[])'::regprocedure);
 if position('''recurringExpenseNames''' in f)=0 then
  if position('''recurringExpenses'',case' in f)=0 then raise exception 'PROJECTION_CHANGED';end if;
  f:=replace(f,'''recurringExpenses'',case','''recurringExpenseNames'',case when ''budgets''=any(menus) then p->''recurringExpenseNames'' else null end, ''recurringExpenses'',case');execute f;
 end if;
 f:=pg_get_functiondef('billflow_private.save_workspace(jsonb,bigint)'::regprocedure);
 f:=replace(f,'allowed:=allowed||array[''budgets'',''recurringExpenses'']','allowed:=allowed||array[''budgets'',''recurringExpenses'',''recurringExpenseNames'']');
 f:=replace(f,'''budgets'',''recurringExpenses'',''documentSources''] loop','''budgets'',''recurringExpenses'',''recurringExpenseNames'',''documentSources''] loop');
 -- Missing catalog preserves the old defaults instead of turning them into an empty list.
 f:=replace(f,'if k=any(allowed) then merged:=jsonb_set(merged,array[k],coalesce(new_payload->k,''[]''));','if k=''recurringExpenseNames'' and (new_payload->k is null or new_payload->k=''null''::jsonb) then continue;end if; if k=any(allowed) then merged:=jsonb_set(merged,array[k],coalesce(new_payload->k,''[]''));');execute f;
end $migration$;
create or replace function billflow_private.recurring_due(r jsonb,d date) returns boolean language sql immutable security invoker set search_path='' as $$
 select (r->>'repeat' is distinct from 'false' or d=(r->>'startDate')::date)
 and d>=(r->>'startDate')::date and (coalesce(r->>'paidThrough','')='' or d>(r->>'paidThrough')::date)
 and (r->>'frequency'='monthly' or extract(month from d)=extract(month from (r->>'startDate')::date))
 and extract(day from d)=least(extract(day from (r->>'startDate')::date),extract(day from (date_trunc('month',d)+interval '1 month - 1 day')));
$$;
do $migration$
declare f text;
begin
 f:=pg_get_functiondef('billflow_private.validate_recurring()'::regprocedure);
 if position('INVALID_RECURRING_NAMES' in f)=0 then
 f:=replace(f,'if not(new.payload?''recurringExpenses'')', $insert$
 if new.payload?'recurringExpenseNames' and new.payload->'recurringExpenseNames'<>'null'::jsonb then
  if jsonb_typeof(new.payload->'recurringExpenseNames') is distinct from 'array' or jsonb_array_length(new.payload->'recurringExpenseNames')>200 then raise exception 'INVALID_RECURRING_NAMES';end if;
  for r in select value from jsonb_array_elements(new.payload->'recurringExpenseNames') loop
   if jsonb_typeof(r->'id') is distinct from 'string' or length(r->>'id') not between 1 and 100 or jsonb_typeof(r->'name') is distinct from 'string' or length(trim(r->>'name')) not between 1 and 150 then raise exception 'INVALID_RECURRING_NAMES';end if;
  end loop;
  if (select count(distinct x->>'id') from jsonb_array_elements(new.payload->'recurringExpenseNames') x)<>jsonb_array_length(new.payload->'recurringExpenseNames') or (select count(distinct lower(trim(x->>'name'))) from jsonb_array_elements(new.payload->'recurringExpenseNames') x)<>jsonb_array_length(new.payload->'recurringExpenseNames') then raise exception 'INVALID_RECURRING_NAMES';end if;
 end if;
 if not(new.payload?'recurringExpenses')$insert$);
 f:=replace(f,'for r in select value from jsonb_array_elements(new.payload->''recurringExpenses'') loop','for r in select value from jsonb_array_elements(new.payload->''recurringExpenses'') loop if r?''repeat'' and jsonb_typeof(r->''repeat'') is distinct from ''boolean'' then raise exception ''INVALID_REPEAT'';end if;');execute f;
 end if;
end $migration$;
commit;
