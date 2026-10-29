begin;
-- BillFlow visits are tracked separately from the shared authentication directory.
create table billflow_private.registrations(
 user_id uuid primary key references auth.users(id) on delete cascade,
 registered_at timestamptz not null default now()
);
alter table billflow_private.registrations enable row level security;
revoke all on billflow_private.registrations from public,anon,authenticated;

create function billflow_private.register_visit() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED';end if;
 insert into billflow_private.registrations(user_id) values(auth.uid()) on conflict(user_id) do nothing;
end $$;
create or replace function public.billflow_access_context() returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform billflow_private.register_visit();
 return billflow_private.access_context();
end $$;
create function billflow_private.list_applicants() returns jsonb language plpgsql security definer set search_path='' as $$
declare boss uuid; result jsonb;
begin
 select owner into boss from billflow_private.workspace where id=1;
 if auth.uid() is null or auth.uid() is distinct from boss then raise exception 'OWNER_ONLY';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'name',coalesce(nullif(left(u.raw_user_meta_data->>'full_name',150),''),split_part(u.email,'@',1)),'registeredAt',coalesce(r.registered_at,u.created_at),'confirmed',u.email_confirmed_at is not null) order by coalesce(r.registered_at,u.created_at) desc),'[]'::jsonb) into result
 from auth.users u left join billflow_private.registrations r on r.user_id=u.id
 where u.id<>boss and u.deleted_at is null and not exists(select 1 from public.billflow_members m where m.user_id=u.id)
 and (r.user_id is not null or u.raw_user_meta_data->>'billflow_signup'='true' or exists(select 1 from public.billflow_ledgers l where l.owner=u.id));
 return result;
end $$;
create function public.billflow_list_applicants() returns jsonb language sql security invoker set search_path='' as $$select billflow_private.list_applicants();$$;
revoke all on function billflow_private.register_visit(),billflow_private.list_applicants(),public.billflow_list_applicants() from public,anon;
grant execute on function billflow_private.register_visit(),billflow_private.list_applicants(),public.billflow_list_applicants() to authenticated;
-- Repair the already verified BillFlow signup reported in this incident without granting menus.
insert into billflow_private.registrations(user_id,registered_at)
select id,created_at from auth.users where lower(email)='niasae.purong@gmail.com' and email_confirmed_at is not null
on conflict(user_id) do nothing;
commit;
