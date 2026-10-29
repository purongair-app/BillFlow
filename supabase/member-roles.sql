begin;
alter table public.billflow_members add column role text not null default 'employee' check(role in ('manager','shop_admin','employee'));
create function billflow_private.manage_members_v2(p_action text,p_email text default '',p_name text default '',p_menus text[] default '{}',p_edit text[] default '{}',p_enabled boolean default true,p_role text default 'employee') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_role is null or p_role not in ('manager','shop_admin','employee') then raise exception 'INVALID_ROLE';end if;
 -- Existing owner check and email-account validation run before any role mutation.
 result:=billflow_private.manage_members(p_action,p_email,p_name,p_menus,p_edit,p_enabled);
 if p_action='save' then update public.billflow_members set role=p_role where user_id=(select id from auth.users where lower(email)=lower(trim(p_email)));end if;
 select coalesce(jsonb_agg(x||jsonb_build_object('role',m.role)),'[]') into result from jsonb_array_elements(result) x join public.billflow_members m on m.user_id::text=x->>'id';
 return result;
end $$;
create function public.billflow_manage_members_v2(p_action text,p_email text default '',p_name text default '',p_menus text[] default '{}',p_edit text[] default '{}',p_enabled boolean default true,p_role text default 'employee') returns jsonb language sql security invoker set search_path='' as $$select billflow_private.manage_members_v2(p_action,p_email,p_name,p_menus,p_edit,p_enabled,p_role);$$;
revoke all on function billflow_private.manage_members_v2(text,text,text,text[],text[],boolean,text),public.billflow_manage_members_v2(text,text,text,text[],text[],boolean,text) from public,anon;
grant execute on function billflow_private.manage_members_v2(text,text,text,text[],text[],boolean,text),public.billflow_manage_members_v2(text,text,text,text[],text[],boolean,text) to authenticated;
commit;
