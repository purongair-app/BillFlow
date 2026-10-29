begin;
create table billflow_private.workspace(id integer primary key check(id=1),owner uuid not null unique references auth.users(id));
insert into billflow_private.workspace select 1,owner from public.billflow_line_settings where basic_id='@191anfqj';
revoke all on billflow_private.workspace from public,anon,authenticated;
create table public.billflow_members(
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(display_name) between 1 and 150),
 menus text[] not null default '{}', edit_menus text[] not null default '{}', enabled boolean not null default true,
 updated_at timestamptz not null default now(),
 check(menus<@array['overview','entries','cashbook','accounts','people','debts','budgets','reports']),
 check(edit_menus<@array['entries','accounts','people','debts','budgets'] and edit_menus<@menus)
);
alter table public.billflow_members enable row level security;
revoke all on public.billflow_members from public,anon,authenticated;
grant select on public.billflow_members to authenticated;
grant all on public.billflow_members to service_role;
create policy member_self_read on public.billflow_members for select to authenticated using(user_id=(select auth.uid()));
create function billflow_private.project_payload(p jsonb,menus text[]) returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('business',coalesce(p->'business','""'),'accounts',case when menus&&array['overview','entries','cashbook','accounts','debts','budgets','reports'] then coalesce(p->'accounts','[]') else '[{"id":"restricted","name":"บัญชีที่ไม่เปิดสิทธิ์","opening":0}]'::jsonb end,
 'entries',case when menus&&array['overview','entries','cashbook','accounts','debts','budgets','reports'] then coalesce(p->'entries','[]') else '[]'::jsonb end,
 'debts',case when menus&&array['overview','entries','cashbook','accounts','debts','budgets','reports'] then coalesce(p->'debts','[]') else '[]'::jsonb end,
 'categories',case when menus&&array['overview','entries','cashbook','accounts','debts','budgets','reports'] then coalesce(p->'categories','[]') else '[]'::jsonb end,
 'contacts',case when cardinality(menus)>0 then coalesce(p->'contacts','[]') else '[]'::jsonb end,
 'employees',case when cardinality(menus)>0 then coalesce(p->'employees','[]') else '[]'::jsonb end,
 'budgets',case when 'budgets'=any(menus) then coalesce(p->'budgets','[]') else '[]'::jsonb end,
 'documentSources',case when 'debts'=any(menus) then coalesce(p->'documentSources','[]') else '[]'::jsonb end,
 'accountHolders',case when 'accounts'=any(menus) then coalesce(p->'accountHolders','[]') else '[]'::jsonb end,'audit','[]'::jsonb);
$$;
create function billflow_private.default_payload() returns jsonb language sql immutable security invoker set search_path='' as $$select '{"business":"ร้านของฉัน","accounts":[{"id":"cash","name":"เงินสด","opening":0},{"id":"bank","name":"บัญชีธนาคาร","opening":0}],"entries":[],"debts":[],"contacts":[],"employees":[],"categories":["ค่าบริการ","ขายสินค้า","อะไหล่และวัสดุ","ค่าเดินทาง","เงินเดือน","ค่าน้ำค่าไฟ","ค่าเช่า","อื่น ๆ"],"budgets":[],"audit":[],"accountHolders":[],"documentSources":[]}'::jsonb;$$;
create function billflow_private.access_context() returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); boss uuid; m public.billflow_members; p jsonb; rev bigint;
begin
 if who is null then raise exception 'UNAUTHORIZED';end if;
 select owner into boss from billflow_private.workspace where id=1;
 select payload,revision into p,rev from public.billflow_ledgers where owner=who;
 p:=coalesce(p,billflow_private.default_payload());
 if who=boss then return jsonb_build_object('payload',p,'revision',coalesce(rev,0),'access',jsonb_build_object('owner',true,'workspaceOwner',who,'menus',array['overview','entries','cashbook','accounts','people','debts','budgets','reports','inbox','line','settings','permissions'],'editMenus',array['entries','accounts','people','debts','budgets']));end if;
 select * into m from public.billflow_members where user_id=who and enabled;
 return jsonb_build_object('payload',case when m.user_id is not null and cardinality(m.menus)>0 then billflow_private.project_payload(p,m.menus) else null end,'revision',coalesce(rev,0),'access',jsonb_build_object('owner',false,'workspaceOwner',who,'menus',coalesce(m.menus,'{}'),'editMenus',coalesce(m.edit_menus,'{}')));
end $$;
create function billflow_private.manage_members(p_action text,p_email text default '',p_name text default '',p_menus text[] default '{}',p_edit text[] default '{}',p_enabled boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare boss uuid; who uuid; result jsonb;
begin
 select owner into boss from billflow_private.workspace where id=1;
 if auth.uid() is null or auth.uid()<>boss then raise exception 'OWNER_ONLY';end if;
 if p_action='save' then
  if p_menus is null or p_edit is null or not(p_menus<@array['overview','entries','cashbook','accounts','people','debts','budgets','reports']) or not(p_edit<@array['entries','accounts','people','debts','budgets'] and p_edit<@p_menus) then raise exception 'INVALID_MENUS';end if;
  select id into who from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
  if who is null then raise exception 'ACCOUNT_NOT_FOUND';end if;
  if who=boss then raise exception 'CANNOT_CHANGE_OWNER';end if;
  insert into public.billflow_members(user_id,display_name,menus,edit_menus,enabled) values(who,trim(p_name),p_menus,p_edit,p_enabled)
  on conflict(user_id) do update set display_name=excluded.display_name,menus=excluded.menus,edit_menus=excluded.edit_menus,enabled=excluded.enabled,updated_at=now();
 elsif p_action<>'list' then raise exception 'INVALID_ACTION';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'email',u.email,'name',m.display_name,'menus',m.menus,'editMenus',m.edit_menus,'enabled',m.enabled,'updatedAt',m.updated_at) order by m.display_name),'[]') into result from public.billflow_members m join auth.users u on u.id=m.user_id;
 return result;
end $$;
create function public.billflow_access_context() returns jsonb language sql security invoker set search_path='' as $$select billflow_private.access_context();$$;
create function public.billflow_manage_members(p_action text,p_email text default '',p_name text default '',p_menus text[] default '{}',p_edit text[] default '{}',p_enabled boolean default true) returns jsonb language sql security invoker set search_path='' as $$select billflow_private.manage_members(p_action,p_email,p_name,p_menus,p_edit,p_enabled);$$;

create function billflow_private.validate_payload(new_payload jsonb,expected_revision bigint) returns void language plpgsql security invoker set search_path='' as $$
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
end $$;
create function billflow_private.save_workspace(new_payload jsonb,expected_revision bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); boss uuid; member public.billflow_members; old jsonb; projected jsonb; merged jsonb; rev bigint; k text; allowed text[]:='{}'; x jsonb; ref text;
begin
 if who is null then raise exception 'UNAUTHORIZED';end if;
 select owner into boss from billflow_private.workspace where id=1;
 if who=boss then return public.billflow_save_ledger(new_payload,expected_revision);end if;
 select * into member from public.billflow_members where user_id=who and enabled;
 if member.user_id is null or cardinality(member.edit_menus)=0 then raise exception 'READ_ONLY';end if;
 select payload,revision into old,rev from public.billflow_ledgers where owner=who for update;
 old:=coalesce(old,billflow_private.default_payload());rev:=coalesce(rev,0);
 if rev is distinct from expected_revision then raise exception 'CONFLICT';end if;
 projected:=billflow_private.project_payload(old,member.menus);merged:=old;
 if 'entries'=any(member.edit_menus) then allowed:=allowed||array['entries'];end if;
 if 'accounts'=any(member.edit_menus) then allowed:=allowed||array['accounts','accountHolders'];end if;
 if 'people'=any(member.edit_menus) then allowed:=allowed||array['contacts','employees'];end if;
 if 'debts'=any(member.edit_menus) then allowed:=allowed||array['debts','documentSources'];end if;
 if 'budgets'=any(member.edit_menus) then allowed:=allowed||array['budgets'];end if;
 foreach k in array array['business','accounts','accountHolders','entries','debts','categories','contacts','employees','budgets','documentSources'] loop
  if k=any(allowed) then merged:=jsonb_set(merged,array[k],coalesce(new_payload->k,'[]'));
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
 return public.billflow_save_ledger(merged,expected_revision);
end $$;
create function public.billflow_save_workspace(new_payload jsonb,expected_revision bigint) returns bigint language sql security invoker set search_path='' as $$select billflow_private.save_workspace(new_payload,expected_revision);$$;

-- Menu settings only: each person continues using their own ledger and receipt folder.
-- Existing ledger RLS and Storage policies are intentionally untouched.
grant usage on schema billflow_private to authenticated;
revoke all on function billflow_private.default_payload(),billflow_private.project_payload(jsonb,text[]),billflow_private.access_context(),billflow_private.manage_members(text,text,text,text[],text[],boolean),billflow_private.validate_payload(jsonb,bigint),billflow_private.save_workspace(jsonb,bigint) from public,anon,authenticated;
grant execute on function billflow_private.access_context(),billflow_private.manage_members(text,text,text,text[],text[],boolean),billflow_private.save_workspace(jsonb,bigint) to authenticated;
revoke all on function public.billflow_access_context(),public.billflow_manage_members(text,text,text,text[],text[],boolean),public.billflow_save_workspace(jsonb,bigint) from public,anon;
grant execute on function public.billflow_access_context(),public.billflow_manage_members(text,text,text,text[],text[],boolean),public.billflow_save_workspace(jsonb,bigint) to authenticated;
create function public.billflow_access_only() returns jsonb language sql security invoker set search_path='' as $$select billflow_private.access_context()->'access';$$;
revoke all on function public.billflow_access_only() from public,anon;
grant execute on function public.billflow_access_only() to authenticated;
commit;
