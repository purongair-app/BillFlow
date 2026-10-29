-- BillFlow uses project maxqjstknhwhymsugutz; all tables and objects are namespaced.
-- All amounts inside payload are integer satang, not floating-point baht.
begin;
create table public.billflow_ledgers (
  owner uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=3000000),
  revision bigint not null default 1 check(revision>0),
  updated_at timestamptz not null default now()
);
alter table public.billflow_ledgers enable row level security;
revoke all on public.billflow_ledgers from public, anon;
grant select,insert,update on public.billflow_ledgers to authenticated;
create policy billflow_read_own on public.billflow_ledgers for select to authenticated using ((select auth.uid())=owner);
create policy billflow_create_own on public.billflow_ledgers for insert to authenticated with check ((select auth.uid())=owner);
create policy billflow_update_own on public.billflow_ledgers for update to authenticated using ((select auth.uid())=owner) with check ((select auth.uid())=owner);
create function public.billflow_save_ledger(new_payload jsonb,expected_revision bigint) returns bigint
language plpgsql security invoker set search_path='' as $$
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
 if expected_revision=0 then
  insert into public.billflow_ledgers(owner,payload,revision) values(auth.uid(),new_payload,1) on conflict(owner) do nothing returning revision into next_revision;
 else
  update public.billflow_ledgers set payload=new_payload,revision=revision+1,updated_at=now() where owner=auth.uid() and revision=expected_revision returning revision into next_revision;
 end if;
 if next_revision is null then raise exception 'CONFLICT'; end if;
 return next_revision;
end $$;
revoke all on function public.billflow_save_ledger(jsonb,bigint) from public,anon;
grant execute on function public.billflow_save_ledger(jsonb,bigint) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('billflow-receipts','billflow-receipts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy billflow_receipt_read on storage.objects for select to authenticated using (bucket_id='billflow-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy billflow_receipt_upload on storage.objects for insert to authenticated with check(bucket_id='billflow-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Existing Storage policies stay unchanged. This guard only scopes BillFlow files.
create policy billflow_receipt_owner_guard on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'billflow-receipts' or ((select auth.uid()) is not null and (storage.foldername(name))[1]=(select auth.uid())::text))
with check (bucket_id <> 'billflow-receipts' or ((select auth.uid()) is not null and (storage.foldername(name))[1]=(select auth.uid())::text));
commit;
