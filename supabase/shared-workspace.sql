-- Share the configured BillFlow workspace, preserving assigned menu/edit permissions.
-- Existing personal ledgers are retained as archives; only their unique contacts are
-- imported by this migration after verifying they contain no separate financial data.
create table billflow_private.shared_workspace_backup_20261030 as select * from public.billflow_ledgers;
revoke all on billflow_private.shared_workspace_backup_20261030 from public,anon,authenticated;
do $$
declare boss uuid; l record; k text; target jsonb; item jsonb;
begin
 select owner into boss from billflow_private.workspace where id=1;
 select payload into target from public.billflow_ledgers where owner=boss for update;
 if target is null then raise exception 'WORKSPACE_LEDGER_REQUIRED';end if;
 for l in select * from public.billflow_ledgers where owner<>boss loop
  if not exists(select 1 from public.billflow_members where user_id=l.owner and enabled) then raise exception 'UNASSIGNED_LEDGER_REQUIRES_REVIEW';end if;
  foreach k in array array['entries','debts','employees','payroll','budgets','accountHolders','documentSources','recurringExpenses'] loop
   if jsonb_array_length(coalesce(l.payload->k,'[]'))>0 then raise exception 'SEPARATE_DATA_REQUIRES_REVIEW:%',k;end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(l.payload->'contacts','[]')) loop
   if exists(select 1 from jsonb_array_elements(coalesce(target->'contacts','[]')) c where c->>'id'=item->>'id' and c<>item) then raise exception 'CONTACT_ID_CONFLICT';end if;
   if exists(select 1 from jsonb_array_elements(coalesce(target->'contacts','[]')) c where c->>'code'=item->>'code' and c->>'id'<>item->>'id') then raise exception 'CONTACT_CODE_CONFLICT';end if;
   if not exists(select 1 from jsonb_array_elements(coalesce(target->'contacts','[]')) c where c->>'id'=item->>'id') then target:=jsonb_set(target,'{contacts}',coalesce(target->'contacts','[]')||jsonb_build_array(item));end if;
  end loop;
 end loop;
 update public.billflow_ledgers set payload=target,revision=revision+1,updated_at=now() where owner=boss;
end $$;
CREATE OR REPLACE FUNCTION billflow_private.validate_payload(new_payload jsonb, expected_revision bigint)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare next_revision bigint; item jsonb; account_ids text[]; debt_ids text[];
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
 if expected_revision is null or expected_revision<0 or jsonb_typeof(new_payload) is distinct from 'object' or octet_length(new_payload::text)>3000000 then raise exception 'INVALID_PAYLOAD'; end if;
 if jsonb_typeof(new_payload->'business') is distinct from 'string' or length(new_payload->>'business')>2000 then raise exception 'INVALID_BUSINESS'; end if;
 if jsonb_typeof(new_payload->'accounts') is distinct from 'array' or jsonb_array_length(new_payload->'accounts')<1 or jsonb_typeof(new_payload->'entries') is distinct from 'array' or jsonb_typeof(new_payload->'debts') is distinct from 'array' or jsonb_typeof(new_payload->'budgets') is distinct from 'array' or jsonb_typeof(new_payload->'categories') is distinct from 'array' or jsonb_typeof(new_payload->'audit') is distinct from 'array' then raise exception 'INVALID_COLLECTION'; end if;
 select array_agg(x->>'id') into account_ids from jsonb_array_elements(new_payload->'accounts') x;
 if (select count(distinct x) from unnest(account_ids) x)<>jsonb_array_length(new_payload->'accounts') then raise exception 'DUPLICATE_ACCOUNT'; end if;
 for item in select value from jsonb_array_elements(new_payload->'accounts') loop
  if jsonb_typeof(item->'name') is distinct from 'string' or coalesce(item->>'id','')='' or coalesce(item->>'opening','') !~ '^-?[0-9]+$' or abs((item->>'opening')::numeric)>100000000000000 then raise exception 'INVALID_ACCOUNT'; end if;
 end loop;
 select array_agg(x->>'id') into debt_ids from jsonb_array_elements(new_payload->'debts') x;
 if (select count(distinct x) from unnest(debt_ids) x)<>jsonb_array_length(new_payload->'debts') then raise exception 'DUPLICATE_DEBT'; end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(new_payload->'entries') x)<>jsonb_array_length(new_payload->'entries') then raise exception 'DUPLICATE_ENTRY'; end if;
 for item in select value from jsonb_array_elements(new_payload->'entries') loop
  if coalesce(item->>'type','') not in ('income','expense','transfer') or coalesce(item->>'amount','') !~ '^[0-9]+$' or (item->>'amount')::numeric<=0 or (item->>'amount')::numeric>100000000000000 or coalesce(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((item->>'date')::date,'YYYY-MM-DD')<>item->>'date' or not coalesce((item->>'account')=any(account_ids),false) then raise exception 'INVALID_ENTRY'; end if;
  if item->>'type'='transfer' and (not coalesce((item->>'to')=any(account_ids),false) or item->>'to'=item->>'account' or coalesce(item->>'debtId','')<>'') then raise exception 'INVALID_TRANSFER'; end if;
  if coalesce(item->>'debtId','')<>'' and not coalesce((item->>'debtId')=any(debt_ids),false) then raise exception 'INVALID_DEBT_LINK'; end if;
 end loop;
 for item in select value from jsonb_array_elements(new_payload->'debts') loop
  if coalesce(item->>'type','') not in ('receivable','payable') or coalesce(item->>'amount','') !~ '^[0-9]+$' or (item->>'amount')::numeric<=0 or (item->>'amount')::numeric>100000000000000 or coalesce(item->>'due','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_DEBT'; end if;
  if exists(select 1 from jsonb_array_elements(new_payload->'entries') e where e->>'debtId'=item->>'id' and e->>'type'<>case when item->>'type'='receivable' then 'income' else 'expense' end) then raise exception 'INVALID_PAYMENT_TYPE'; end if;
  if (select coalesce(sum((e->>'amount')::numeric),0) from jsonb_array_elements(new_payload->'entries') e where e->>'debtId'=item->>'id')>(item->>'amount')::numeric then raise exception 'OVERPAYMENT'; end if;
 end loop;
 return;
end $function$;

create or replace function billflow_private.save_shared_ledger(new_payload jsonb,expected_revision bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare boss uuid; next_revision bigint;
begin
 select owner into boss from billflow_private.workspace where id=1;
 if auth.uid() is null or not (auth.uid()=boss or exists(select 1 from public.billflow_members where user_id=auth.uid() and enabled and cardinality(edit_menus)>0)) then raise exception 'READ_ONLY';end if;
 perform billflow_private.validate_payload(new_payload,expected_revision);
 update public.billflow_ledgers set payload=new_payload,revision=revision+1,updated_at=now() where owner=boss and revision=expected_revision returning revision into next_revision;
 if next_revision is null then raise exception 'CONFLICT';end if;
 return next_revision;
end $$;
revoke all on function billflow_private.save_shared_ledger(jsonb,bigint) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION billflow_private.access_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare who uuid:=auth.uid(); boss uuid; m public.billflow_members; p jsonb; rev bigint;
begin
 if who is null then raise exception 'UNAUTHORIZED';end if;
 select owner into boss from billflow_private.workspace where id=1;
 select payload,revision into p,rev from public.billflow_ledgers where owner=boss;
 p:=coalesce(p,billflow_private.default_payload());
 if who=boss then return jsonb_build_object('payload',p,'revision',coalesce(rev,0),'access',jsonb_build_object('owner',true,'workspaceOwner',boss,'menus',array['overview','entries','cashbook','accounts','people','debts','budgets','reports','inbox','line','settings','permissions'],'editMenus',array['entries','accounts','people','debts','budgets']));end if;
 select * into m from public.billflow_members where user_id=who and enabled;
 return jsonb_build_object('payload',case when m.user_id is not null and cardinality(m.menus)>0 then billflow_private.project_payload(p,m.menus) else null end,'revision',coalesce(rev,0),'access',jsonb_build_object('owner',false,'workspaceOwner',boss,'menus',coalesce(m.menus,'{}'),'editMenus',coalesce(m.edit_menus,'{}')));
end $function$;

CREATE OR REPLACE FUNCTION billflow_private.save_workspace(new_payload jsonb, expected_revision bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare who uuid:=auth.uid(); boss uuid; member public.billflow_members; old jsonb; projected jsonb; merged jsonb; rev bigint; k text; allowed text[]:='{}'; x jsonb; ref text;
begin
 if who is null then raise exception 'UNAUTHORIZED';end if;
 select owner into boss from billflow_private.workspace where id=1;
 if who=boss then return billflow_private.save_shared_ledger(new_payload,expected_revision);end if;
 select * into member from public.billflow_members where user_id=who and enabled;
 if member.user_id is null or cardinality(member.edit_menus)=0 then raise exception 'READ_ONLY';end if;
 select payload,revision into old,rev from public.billflow_ledgers where owner=boss for update;
 old:=coalesce(old,billflow_private.default_payload());rev:=coalesce(rev,0);
 if rev is distinct from expected_revision then raise exception 'CONFLICT';end if;
 projected:=billflow_private.project_payload(old,member.menus);merged:=old;
 if 'payroll'=any(member.edit_menus) then allowed:=allowed||array['payroll'];end if; if 'entries'=any(member.edit_menus) then allowed:=allowed||array['entries'];end if;
 if 'accounts'=any(member.edit_menus) then allowed:=allowed||array['accounts','accountHolders','bookkeeping'];end if;
 if 'people'=any(member.edit_menus) then allowed:=allowed||array['contacts','employees'];end if;
 if 'debts'=any(member.edit_menus) then allowed:=allowed||array['debts','documentSources'];end if;
 if 'budgets'=any(member.edit_menus) then allowed:=allowed||array['budgets','recurringExpenses','recurringExpenseNames'];end if;
 foreach k in array array['numbering','business','accounts','accountHolders','bookkeeping','entries','debts','categories','contacts','employees','budgets','recurringExpenses','recurringExpenseNames','documentSources','payroll'] loop
  if k='numbering' and not(new_payload?'numbering') then continue;end if; if k='bookkeeping' and (new_payload->k is null or new_payload->k='null'::jsonb) then continue;end if; if k='recurringExpenseNames' and (new_payload->k is null or new_payload->k='null'::jsonb) then continue;end if; if k=any(allowed) then merged:=jsonb_set(merged,array[k],coalesce(new_payload->k,'[]'));
  elsif coalesce(new_payload->k,'[]') is distinct from coalesce(projected->k,'[]') then raise exception 'MENU_FORBIDDEN:%',k;end if;
 end loop;
 for x in select value from jsonb_array_elements(merged->'entries') loop
  if coalesce(x->>'contactId','')<>'' and not exists(select 1 from jsonb_array_elements(coalesce(merged->'contacts','[]')) c where c->>'id'=x->>'contactId') then raise exception 'CONTACT_IN_USE';end if;
  foreach ref in array array['recipientEmployeeId','payerEmployeeId','claimantEmployeeId','beneficiaryEmployeeId'] loop
   if coalesce(x->>ref,'')<>'' and not exists(select 1 from jsonb_array_elements(coalesce(merged->'employees','[]')) e where e->>'id'=x->>ref) then raise exception 'EMPLOYEE_IN_USE';end if;
  end loop;
 end loop;
 for x in select value from jsonb_array_elements(merged->'debts') loop
  if coalesce(x->>'contactId','')<>'' and not exists(select 1 from jsonb_array_elements(coalesce(merged->'contacts','[]')) c where c->>'id'=x->>'contactId') then raise exception 'CONTACT_IN_USE';end if;
  if coalesce(x->>'documentSourceId','')<>'' and not exists(select 1 from jsonb_array_elements(coalesce(merged->'documentSources','[]')) c where c->>'id'=x->>'documentSourceId') then raise exception 'SOURCE_IN_USE';end if;
 end loop;
 merged:=jsonb_set(merged,'{audit}',jsonb_build_array(jsonb_build_object('date',now(),'text','พนักงาน '||member.display_name||' แก้ไขข้อมูลตามสิทธิ์'))||coalesce(old->'audit','[]'));
 perform billflow_private.validate_payload(merged,expected_revision);
 return billflow_private.save_shared_ledger(merged,expected_revision);
end $function$;

-- Only the validated workspace RPC may mutate ledger data.
revoke insert,update on public.billflow_ledgers from authenticated;
revoke execute on function public.billflow_save_ledger(jsonb,bigint) from public,anon,authenticated;
create or replace function billflow_private.shared_receipt_access(folder text,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from billflow_private.workspace w where w.id=1 and w.owner::text=folder and
 (w.owner=auth.uid() or exists(select 1 from public.billflow_members m where m.user_id=auth.uid() and m.enabled and
 case when writing then m.edit_menus&&array['entries','debts','payroll'] else m.menus&&array['overview','entries','cashbook','accounts','debts','budgets','reports','payroll'] end)));
$$;
revoke all on function billflow_private.shared_receipt_access(text,boolean) from public,anon;
grant execute on function billflow_private.shared_receipt_access(text,boolean) to authenticated;
alter policy billflow_receipt_read on storage.objects using (bucket_id='billflow-receipts' and billflow_private.shared_receipt_access((storage.foldername(name))[1],false));
alter policy billflow_receipt_upload on storage.objects with check (bucket_id='billflow-receipts' and billflow_private.shared_receipt_access((storage.foldername(name))[1],true));
alter policy billflow_receipt_owner_guard on storage.objects using (bucket_id<>'billflow-receipts' or billflow_private.shared_receipt_access((storage.foldername(name))[1],false)) with check (bucket_id<>'billflow-receipts' or billflow_private.shared_receipt_access((storage.foldername(name))[1],true));
