begin;
alter table public.billflow_members drop constraint billflow_members_menus_check, drop constraint billflow_members_check;
alter table public.billflow_members add constraint billflow_members_menus_check check(menus<@array['overview','entries','cashbook','accounts','people','debts','budgets','reports','payroll']), add constraint billflow_members_check check(edit_menus<@array['entries','accounts','people','debts','budgets','payroll'] and edit_menus<@menus);
-- Extend the existing per-user ledger/menu model; salary records remain in that user's ledger.
do $patch$
declare f text;
begin
 f:=pg_get_functiondef('billflow_private.manage_members(text,text,text,text[],text[],boolean)'::regprocedure);
 if position('''payroll''' in f)=0 then f:=replace(f,'''budgets'',''reports''','''budgets'',''reports'',''payroll''');f:=replace(f,'''debts'',''budgets'']','''debts'',''budgets'',''payroll'']');execute f;end if;
 f:=pg_get_functiondef('billflow_private.project_payload(jsonb,text[])'::regprocedure);
 if position('''payroll''' in f)=0 then
 f:=replace(f,'''budgets'',''reports'']','''budgets'',''reports'',''payroll'']');
 f:=replace(f,'''audit'',''[]''::jsonb','''payroll'',case when menus&&array[''overview'',''entries'',''cashbook'',''accounts'',''debts'',''budgets'',''reports'',''payroll''] then coalesce(p->''payroll'',''[]''::jsonb) else ''[]''::jsonb end,''audit'',''[]''::jsonb');execute f;
 end if;
 f:=pg_get_functiondef('billflow_private.save_workspace(jsonb,bigint)'::regprocedure);
 if position('''payroll''' in f)=0 then
 f:=replace(f,'if ''entries''=any(member.edit_menus)', 'if ''payroll''=any(member.edit_menus) then allowed:=allowed||array[''payroll''];end if; if ''entries''=any(member.edit_menus)');
 f:=replace(f,'''recurringExpenseNames'',''documentSources''] loop','''recurringExpenseNames'',''documentSources'',''payroll''] loop');execute f;
 end if;
 f:=pg_get_functiondef('billflow_private.ledger_usage()'::regprocedure);
 if position('''payroll''' in f)=0 then f:=replace(f,'''recurringExpenseNames''] loop','''recurringExpenseNames'',''payroll''] loop');f:=replace(f,'when ''entries'' then','when ''payroll'' then ''เงินเดือน / ประวัติแบ่งจ่าย'' when ''entries'' then');execute f;end if;
end $patch$;
create or replace function billflow_private.validate_payroll() returns trigger language plpgsql security invoker set search_path='' as $fn$
declare p jsonb; prev jsonb; x jsonb; px jsonb; e jsonb; prior_entry jsonb; l jsonb; gross numeric; deductions numeric; paid numeric; net numeric; base jsonb:='{}'; payroll_changed boolean; actor_access jsonb; edit_rights text[]; expected_id text; is_void boolean;
begin
 if tg_op='UPDATE' then base:=old.payload;end if;
 -- Older clients preserve payroll and cannot silently erase it.
 if base?'payroll' and not(new.payload?'payroll') then new.payload:=jsonb_set(new.payload,'{payroll}',base->'payroll');end if;
 payroll_changed:=coalesce(base->'payroll','[]') is distinct from coalesce(new.payload->'payroll','[]');
 if payroll_changed then
  if auth.uid() is null then raise exception 'PAYROLL_UNAUTHORIZED';end if;
  actor_access:=public.billflow_access_only();select coalesce(array_agg(value),'{}') into edit_rights from jsonb_array_elements_text(actor_access->'editMenus');
  if not coalesce((actor_access->>'owner')::boolean,false) and not('payroll'=any(edit_rights)) then raise exception 'PAYROLL_FORBIDDEN';end if;
 end if;
 if not(new.payload?'payroll') then return new;end if;
 if jsonb_typeof(new.payload->'payroll') is distinct from 'array' or jsonb_array_length(new.payload->'payroll')>5000 then raise exception 'PAYROLL_INVALID';end if;
 if (select count(*) from jsonb_array_elements(new.payload->'payroll'))<>(select count(distinct record_pl->>'id') from jsonb_array_elements(new.payload->'payroll') record_pl) then raise exception 'PAYROLL_DUPLICATE';end if;
 if exists(select 1 from jsonb_array_elements(new.payload->'payroll') record_pl where record_pl->>'status'<>'cancelled' group by record_pl->>'employeeId',record_pl->>'periodStart',record_pl->>'periodEnd' having count(*)>1) then raise exception 'PAYROLL_DUPLICATE_PERIOD';end if;
 for p in select value from jsonb_array_elements(new.payload->'payroll') loop
  if jsonb_typeof(p->'id') is distinct from 'string' or length(p->>'id') not between 1 and 100 or coalesce(p->>'status','') not in ('draft','approved','cancelled') or coalesce(p->>'basis','') not in ('monthly','daily','hourly') or not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'employees','[]')) emp where emp->>'id'=p->>'employeeId') then raise exception 'PAYROLL_INVALID';end if;
  if exists(select 1 from unnest(array['employeeName','employeeCode','position','note']) k where jsonb_typeof(p->k) is distinct from 'string' or length(p->>k)>500) or length(trim(p->>'employeeName'))=0 then raise exception 'PAYROLL_INVALID_TEXT';end if;
  foreach expected_id in array array['periodStart','periodEnd','dueDate'] loop
   if coalesce(p->>expected_id,'') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p->>expected_id)::date,'YYYY-MM-DD')<>p->>expected_id then raise exception 'PAYROLL_DATE';end if;
  end loop;
  if p->>'periodStart'>p->>'periodEnd' or coalesce(p->>'units','') !~ '^\d+(\.\d+)?$' or (p->>'units')::numeric<=0 or (p->>'units')::numeric>10000 or coalesce(p->>'rate','') !~ '^\d+$' or (p->>'rate')::numeric>1000000000000 or coalesce(p->>'employerSocial','') !~ '^\d+$' or (p->>'employerSocial')::numeric>1000000000000 then raise exception 'PAYROLL_RATE';end if;
  if jsonb_typeof(p->'earnings') is distinct from 'array' or jsonb_typeof(p->'deductions') is distinct from 'array' or jsonb_typeof(p->'payments') is distinct from 'array' or jsonb_array_length(p->'earnings')>50 or jsonb_array_length(p->'deductions')>50 then raise exception 'PAYROLL_LINES';end if;
  gross:=round((p->>'units')::numeric*(p->>'rate')::numeric);deductions:=0;paid:=0;
  for l in select value from jsonb_array_elements((p->'earnings')||(p->'deductions')) loop
   if jsonb_typeof(l->'name') is distinct from 'string' or length(trim(l->>'name')) not between 1 and 150 or coalesce(l->>'amount','') !~ '^\d+$' or (l->>'amount')::numeric>1000000000000 then raise exception 'PAYROLL_LINE';end if;
  end loop;
  select gross+coalesce(sum((line_record->>'amount')::numeric),0) into gross from jsonb_array_elements(p->'earnings') line_record;
  for l in select value from jsonb_array_elements(p->'deductions') loop
   if coalesce(l->>'kind','') not in ('tax','social','provident','advance','unpaid','other') then raise exception 'PAYROLL_DEDUCTION';end if;deductions:=deductions+(l->>'amount')::numeric;
  end loop;
  net:=gross-deductions;if gross<=0 or gross>1000000000000 or net<0 then raise exception 'PAYROLL_NET';end if;
  if p->>'status'<>'draft' and (coalesce(p->>'approvalDate','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p->>'approvalDate')::date,'YYYY-MM-DD')<>p->>'approvalDate' or nullif(p->>'approvedAt','')::timestamptz is null) then raise exception 'PAYROLL_APPROVAL';end if;
  if p->>'status'='draft' and jsonb_array_length(p->'payments')>0 then raise exception 'PAYROLL_NOT_APPROVED';end if;
  select value into prev from jsonb_array_elements(coalesce(base->'payroll','[]')) where value->>'id'=p->>'id';
  if prev->>'status' in ('approved','cancelled') then
   if (p-array['payments','status','cancelDate','cancelReason']) is distinct from (prev-array['payments','status','cancelDate','cancelReason']) or p->>'status'='draft' or (prev->>'status'='cancelled' and prev is distinct from p) then raise exception 'PAYROLL_APPROVED_IMMUTABLE';end if;
   for px in select value from jsonb_array_elements(prev->'payments') loop
    select value into x from jsonb_array_elements(p->'payments') where value->>'id'=px->>'id';
    if x is null or (x-array['voidDate','voidReason']) is distinct from (px-array['voidDate','voidReason']) or (px?'voidDate' and px is distinct from x) then raise exception 'PAYROLL_PAYMENT_IMMUTABLE';end if;
   end loop;
  end if;
  for x in select value from jsonb_array_elements(p->'payments') loop
   if length(coalesce(x->>'id','')) not between 1 and 100 or coalesce(x->>'amount','') !~ '^\d+$' or (x->>'amount')::numeric<=0 or (x->>'amount')::numeric>net or coalesce(x->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((x->>'date')::date,'YYYY-MM-DD')<>x->>'date' or x->>'date'<p->>'approvalDate' or coalesce(x->>'method','') not in ('cash','bank','card','other') or not exists(select 1 from jsonb_array_elements(new.payload->'accounts') a where a->>'id'=x->>'account') or exists(select 1 from unnest(array['reference','note']) k where jsonb_typeof(x->k) is distinct from 'string' or length(x->>k)>500) then raise exception 'PAYROLL_PAYMENT';end if;
   if (select count(*) from jsonb_array_elements(new.payload->'payroll') z cross join lateral jsonb_array_elements(z->'payments') q where q->>'id'=x->>'id')<>1 then raise exception 'PAYROLL_DUPLICATE_PAYMENT';end if;
   if x?'voidDate' then
    if coalesce(x->>'voidDate','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((x->>'voidDate')::date,'YYYY-MM-DD')<>x->>'voidDate' or x->>'voidDate'<x->>'date' or length(trim(coalesce(x->>'voidReason',''))) not between 1 and 500 then raise exception 'PAYROLL_VOID';end if;
   else paid:=paid+(x->>'amount')::numeric;end if;
   foreach is_void in array (case when x?'voidDate' then array[false,true] else array[false] end) loop
    expected_id:='payroll-payment:'||(x->>'id')||case when is_void then ':void' else '' end;
    select value into e from jsonb_array_elements(new.payload->'entries') where value->>'id'=expected_id;
    if e is null or coalesce(e->'billDetails','null'::jsonb)<>'null'::jsonb or coalesce(e->'withholding','null'::jsonb)<>'null'::jsonb or coalesce(e->>'debtId','')<>'' or coalesce(e->>'to','')<>'' or e->>'payrollId' is distinct from p->>'id' or e->>'payrollPaymentId' is distinct from x->>'id' or e->>'amount' is distinct from x->>'amount' or e->>'account' is distinct from x->>'account' or e->>'date' is distinct from (case when is_void then x->>'voidDate' else x->>'date' end) or e->>'type' is distinct from (case when is_void then 'income' else 'expense' end) or e->>'category' is distinct from 'เงินเดือน' or coalesce((e->>'payrollReversal')::boolean,false)<>is_void or (not is_void and (e->'file' is distinct from x->'file' or e->>'recipientEmployeeId' is distinct from p->>'employeeId')) then raise exception 'PAYROLL_ENTRY_MISMATCH';end if;
    select value into prior_entry from jsonb_array_elements(coalesce(base->'entries','[]')) where value->>'id'=expected_id;
    if prior_entry is null and not coalesce((actor_access->>'owner')::boolean,false) and not coalesce('entries'=any(edit_rights),false) then raise exception 'PAYROLL_ENTRIES_FORBIDDEN';end if;
   end loop;
  end loop;
  if paid>net then raise exception 'PAYROLL_OVERPAYMENT';end if;
  if p->>'status'='cancelled' and (paid<>0 or coalesce(p->>'cancelDate','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p->>'cancelDate')::date,'YYYY-MM-DD')<>p->>'cancelDate' or p->>'cancelDate'<p->>'approvalDate' or length(trim(coalesce(p->>'cancelReason',''))) not between 1 and 500) then raise exception 'PAYROLL_CANCEL';end if;
 end loop;
 for prev in select value from jsonb_array_elements(coalesce(base->'payroll','[]')) where value->>'status'<>'draft' loop
  if not exists(select 1 from jsonb_array_elements(new.payload->'payroll') record_pl where record_pl->>'id'=prev->>'id') then raise exception 'PAYROLL_DELETE_APPROVED';end if;
 end loop;
 for prior_entry in select value from jsonb_array_elements(coalesce(base->'entries','[]')) where value?'payrollId' loop
  if not exists(select 1 from jsonb_array_elements(new.payload->'entries') saved_entry where saved_entry=prior_entry) then raise exception 'PAYROLL_ENTRY_IMMUTABLE';end if;
 end loop;
 for e in select value from jsonb_array_elements(new.payload->'entries') where value?'payrollId' loop
  if not exists(select 1 from jsonb_array_elements(new.payload->'payroll') record_pl cross join lateral jsonb_array_elements(record_pl->'payments') record_payment where record_pl->>'id'=e->>'payrollId' and e->>'id'='payroll-payment:'||(record_payment->>'id')||case when coalesce((e->>'payrollReversal')::boolean,false) then ':void' else '' end and (not coalesce((e->>'payrollReversal')::boolean,false) or record_payment?'voidDate')) then raise exception 'PAYROLL_ORPHAN_ENTRY';end if;
 end loop;
 return new;
end $fn$;
revoke all on function billflow_private.validate_payroll() from public,anon,authenticated;
create trigger billflow_validate_payroll before insert or update on public.billflow_ledgers for each row execute function billflow_private.validate_payroll();
commit;
