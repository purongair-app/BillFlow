-- Account scopes: NULL = all current/future accounts; empty array = no accounts.
alter table public.billflow_members add column if not exists account_ids text[] default null;

create or replace function billflow_private.project_member_payload(p jsonb, menus text[], ids text[]) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb; rows jsonb:='[]'; e jsonb; visible_from boolean; visible_to boolean;
begin
 result:=billflow_private.project_payload(p,menus);
 if ids is null then return result;end if;
 result:=jsonb_set(result,'{accounts}',coalesce((select jsonb_agg(a) from jsonb_array_elements(result->'accounts') a where a->>'id'=any(ids)),'[]'));
 for e in select value from jsonb_array_elements(result->'entries') loop
  visible_from:=coalesce(e->>'account'=any(ids),false);
  visible_to:=e->>'type'='transfer' and coalesce(e->>'to'=any(ids),false);
  if not visible_from and not visible_to then continue;end if;
  if e->>'type'='transfer' and not(visible_from and visible_to) then
   -- Keep a transfer, so income/expense summaries and balances remain correct.
   e:=jsonb_build_object('id',e->'id','type','transfer','date',e->'date','title','โอนระหว่างบัญชี (ซ่อนรายละเอียดบัญชีที่ไม่ได้รับสิทธิ์)','amount',e->'amount','account',case when visible_from then e->>'account' else '__restricted__' end,'to',case when visible_to then e->>'to' else '__restricted__' end,'category','โอนระหว่างบัญชี','contact','','note','','scopedTransfer',true,'scopedReadOnly',true);
  elsif coalesce(e->>'debtId','')<>'' or coalesce(e->>'payrollId','')<>'' then
   e:=(e-'debtId'-'payrollId'-'payrollPaymentId'-'payrollReversal')||jsonb_build_object('scopedReadOnly',true);
  end if;
  rows:=rows||jsonb_build_array(e);
 end loop;
 return result||jsonb_build_object('entries',rows,'debts','[]'::jsonb,'payroll','[]'::jsonb,'budgets','[]'::jsonb,'recurringExpenses','[]'::jsonb,'recurringExpenseNames',null,'bookkeeping',case when jsonb_typeof(p->'bookkeeping')='object' then (p->'bookkeeping')||jsonb_build_object('chart',coalesce((select jsonb_agg(a) from jsonb_array_elements(p->'bookkeeping'->'chart') a where coalesce(a->>'cashAccountId','')='' or a->>'cashAccountId'=any(ids)),'[]'),'allocations',coalesce((select jsonb_object_agg(a.key,a.value) from jsonb_each(coalesce(p->'bookkeeping'->'allocations','{}')) a where exists(select 1 from jsonb_array_elements(rows) visible_entry where visible_entry->>'id'=a.key)),'{}'),'journals','[]'::jsonb) else null end,'accountHolders','[]'::jsonb,'documentSources','[]'::jsonb);
end $$;
revoke all on function billflow_private.project_member_payload(jsonb,text[],text[]) from public,anon,authenticated;

create or replace function billflow_private.scoped_menus(menus text[], ids text[]) returns text[] language sql immutable security invoker set search_path='' as $$
 select case when ids is null then menus else array(select x from unnest(menus) x where x<>all(array['debts','payroll','budgets','inbox'])) end;
$$;
revoke all on function billflow_private.scoped_menus(text[],text[]) from public,anon,authenticated;
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
 return jsonb_build_object('payload',case when m.user_id is not null and cardinality(m.menus)>0 then billflow_private.project_member_payload(p,billflow_private.scoped_menus(m.menus,m.account_ids),m.account_ids) else null end,'revision',coalesce(rev,0),'access',jsonb_build_object('owner',false,'workspaceOwner',boss,'menus',billflow_private.scoped_menus(coalesce(m.menus,'{}'),m.account_ids),'editMenus',billflow_private.scoped_menus(coalesce(m.edit_menus,'{}'),m.account_ids),'accountIds',m.account_ids));
end $function$
;

create or replace function billflow_private.manage_members_v3(p_action text,p_email text default '',p_name text default '',p_menus text[] default '{}',p_edit text[] default '{}',p_enabled boolean default true,p_role text default 'employee',p_accounts text[] default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare boss uuid; result jsonb;
begin
 select owner into boss from billflow_private.workspace where id=1;
 if auth.uid() is null or auth.uid()<>boss then raise exception 'OWNER_ONLY';end if;
 if p_accounts is not null and (cardinality(p_accounts)>1000 or exists(select 1 from unnest(p_accounts) a where a is null or not exists(select 1 from public.billflow_ledgers l cross join lateral jsonb_array_elements(l.payload->'accounts') x where l.owner=boss and x->>'id'=a)) or cardinality(p_accounts)<>(select count(distinct a) from unnest(p_accounts) a)) then raise exception 'ACCOUNT_SCOPE_INVALID';end if;
 result:=billflow_private.manage_members_v2(p_action,p_email,p_name,p_menus,p_edit,p_enabled,p_role);
 if p_action='save' then
  update public.billflow_members set account_ids=p_accounts,updated_at=now() where user_id=(select id from auth.users where lower(email)=lower(trim(p_email)));
 end if;
 select coalesce(jsonb_agg(x||jsonb_build_object('accountIds',m.account_ids)),'[]') into result from jsonb_array_elements(result) x join public.billflow_members m on m.user_id::text=x->>'id';
 return result;
end $$;
create or replace function public.billflow_manage_members_v3(p_action text,p_email text default '',p_name text default '',p_menus text[] default '{}',p_edit text[] default '{}',p_enabled boolean default true,p_role text default 'employee',p_accounts text[] default null) returns jsonb
language sql security invoker set search_path='' as $$select billflow_private.manage_members_v3(p_action,p_email,p_name,p_menus,p_edit,p_enabled,p_role,p_accounts);$$;
revoke all on function billflow_private.manage_members_v3(text,text,text,text[],text[],boolean,text,text[]),public.billflow_manage_members_v3(text,text,text,text[],text[],boolean,text,text[]) from public,anon;
grant execute on function billflow_private.manage_members_v3(text,text,text,text[],text[],boolean,text,text[]),public.billflow_manage_members_v3(text,text,text,text[],text[],boolean,text,text[]) to authenticated;

-- Merge only visible rows. Hidden rows and masked transfers always remain canonical.
create or replace function billflow_private.merge_scoped_rows(old_rows jsonb,visible_rows jsonb,next_rows jsonb,ids text[],kind text) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb:='[]'; e jsonb; prior jsonb; shown jsonb;
begin
 if jsonb_typeof(next_rows) is distinct from 'array' then raise exception 'ACCOUNT_SCOPE_INVALID';end if;
 for e in select value from jsonb_array_elements(next_rows) loop
  select x into prior from jsonb_array_elements(old_rows) x where x->>'id'=e->>'id';
  select x into shown from jsonb_array_elements(visible_rows) x where x->>'id'=e->>'id';
  if prior is not null and shown is null then raise exception 'ACCOUNT_SCOPE_HIDDEN';end if;
  if shown->>'scopedReadOnly'='true' then
   if e is distinct from shown then raise exception 'ACCOUNT_SCOPE_READ_ONLY';end if;
   result:=result||jsonb_build_array(prior);continue;
  end if;
  if e ? 'scopedReadOnly' or e ? 'scopedTransfer' then raise exception 'ACCOUNT_SCOPE_INVALID';end if;
  if kind='accounts' then
   if not coalesce(e->>'id'=any(ids),false) then raise exception 'ACCOUNT_SCOPE_INVALID';end if;
  elsif not coalesce(e->>'account'=any(ids),false) or (e->>'type'='transfer' and not coalesce(e->>'to'=any(ids),false)) then raise exception 'ACCOUNT_SCOPE_INVALID';end if;
  result:=result||jsonb_build_array(e);
 end loop;
 for e in select value from jsonb_array_elements(old_rows) loop
  select x into shown from jsonb_array_elements(visible_rows) x where x->>'id'=e->>'id';
  if shown is null then result:=result||jsonb_build_array(e);
  elsif shown->>'scopedReadOnly'='true' and not exists(select 1 from jsonb_array_elements(next_rows) x where x->>'id'=e->>'id') then raise exception 'ACCOUNT_SCOPE_READ_ONLY';end if;
 end loop;
 return result;
end $$;
revoke all on function billflow_private.merge_scoped_rows(jsonb,jsonb,jsonb,text[],text) from public,anon,authenticated;
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
 member.menus:=billflow_private.scoped_menus(member.menus,member.account_ids);
 member.edit_menus:=billflow_private.scoped_menus(member.edit_menus,member.account_ids);
 projected:=billflow_private.project_member_payload(old,member.menus,member.account_ids);merged:=old;
 if 'payroll'=any(member.edit_menus) then allowed:=allowed||array['payroll'];end if; if 'entries'=any(member.edit_menus) then allowed:=allowed||array['entries'];end if;
 if 'accounts'=any(member.edit_menus) then allowed:=allowed||array['accounts','accountHolders','bookkeeping'];end if;
 if 'people'=any(member.edit_menus) then allowed:=allowed||array['contacts','employees'];end if;
 if 'debts'=any(member.edit_menus) then allowed:=allowed||array['debts','documentSources'];end if;
 if 'budgets'=any(member.edit_menus) then allowed:=allowed||array['budgets','recurringExpenses','recurringExpenseNames'];end if;
 foreach k in array array['numbering','business','accounts','accountHolders','bookkeeping','entries','debts','categories','contacts','employees','budgets','recurringExpenses','recurringExpenseNames','documentSources','payroll'] loop
  if k='numbering' and not(new_payload?'numbering') then continue;end if; if k='bookkeeping' and (new_payload->k is null or new_payload->k='null'::jsonb) then continue;end if; if k='recurringExpenseNames' and (new_payload->k is null or new_payload->k='null'::jsonb) then continue;end if; if member.account_ids is not null and k=any(array['accountHolders','bookkeeping','debts','payroll','budgets','recurringExpenses','recurringExpenseNames','documentSources']) then
   if coalesce(new_payload->k,'null') is distinct from coalesce(projected->k,'null') then raise exception 'ACCOUNT_SCOPE_GLOBAL';end if;
  elsif member.account_ids is not null and k=any(array['accounts','entries']) and k=any(allowed) then
   merged:=jsonb_set(merged,array[k],billflow_private.merge_scoped_rows(coalesce(old->k,'[]'),coalesce(projected->k,'[]'),new_payload->k,member.account_ids,k));
  elsif k=any(allowed) then merged:=jsonb_set(merged,array[k],coalesce(new_payload->k,'[]'));
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
end $function$
;

-- A restrictive policy also covers the existing broad workspace read policy.
create or replace function billflow_private.scoped_receipt_access(object_name text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare boss uuid; m public.billflow_members; p jsonb; projected jsonb; fid text;
begin
 if auth.uid() is null then return false;end if;
 select owner into boss from billflow_private.workspace where id=1;
 if split_part(object_name,'/',1)<>boss::text then return false;end if;
 if auth.uid()=boss then return true;end if;
 select * into m from public.billflow_members where user_id=auth.uid() and enabled;
 if m.user_id is null then return false;end if;
 if m.account_ids is null then return true;end if;
 fid:=split_part(object_name,'/',2);
 select payload into p from public.billflow_ledgers where owner=boss;
 projected:=billflow_private.project_member_payload(p,billflow_private.scoped_menus(m.menus,m.account_ids),m.account_ids);
 return jsonb_path_exists(projected,'$.**.file ? (@.id == $id || @.previewId == $id || @.lineImageId == $id)',jsonb_build_object('id',fid));
end $$;
revoke all on function billflow_private.scoped_receipt_access(text) from public,anon;
grant execute on function billflow_private.scoped_receipt_access(text) to authenticated;
create policy billflow_scoped_receipt_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'billflow-receipts' or billflow_private.scoped_receipt_access(name));
