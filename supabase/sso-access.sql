begin;
create sequence if not exists billflow_private.sso_access_version;
revoke all on sequence billflow_private.sso_access_version from public,anon,authenticated;
create table if not exists billflow_private.sso_access(
 user_id uuid primary key references auth.users(id) on delete cascade,
 secret_id uuid not null references vault.secrets(id),
 version bigint not null default nextval('billflow_private.sso_access_version'),
 updated_at timestamptz not null default now()
);
-- No RLS policies: deny direct access. Only the guarded private RPC reads Vault.
alter table billflow_private.sso_access enable row level security;
revoke all on billflow_private.sso_access from public,anon,authenticated;
create or replace function billflow_private.sso_access_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from vault.secrets where id=old.secret_id;return old;end $$;
revoke all on function billflow_private.sso_access_cleanup() from public,anon,authenticated;
drop trigger if exists sso_access_cleanup on billflow_private.sso_access;
create trigger sso_access_cleanup after delete on billflow_private.sso_access for each row execute function billflow_private.sso_access_cleanup();
create or replace function billflow_private.sso_access_manage(p_action text,p_url text default '',p_username text default '',p_password text default '',p_version bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); access jsonb; row billflow_private.sso_access; contents jsonb; secret uuid; stamp timestamptz; rev bigint;
begin
 if who is null then raise exception 'UNAUTHORIZED';end if;
 select public.billflow_access_only() into access;
 if not(coalesce((access->>'owner')::boolean,false) or coalesce(access->'menus','[]'::jsonb)?'payroll') then raise exception 'MENU_FORBIDDEN';end if;
 if p_action is null or p_action not in ('read','save','delete') then raise exception 'INVALID_ACTION';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('billflow-sso-access:'||who::text,0));
 select * into row from billflow_private.sso_access where user_id=who for update;
 if p_action='read' then
  if row.user_id is null then return jsonb_build_object('saved',false,'version',0);end if;
  select decrypted_secret::jsonb into contents from vault.decrypted_secrets where id=row.secret_id;
  if contents is null then raise exception 'CREDENTIALS_UNAVAILABLE';end if;
  return jsonb_build_object('saved',true,'version',row.version,'updatedAt',row.updated_at,'url',contents->>'url','username',contents->>'username','password',contents->>'password');
 end if;
 if p_version is null or p_version<>coalesce(row.version,0) then raise exception 'CONFLICT';end if;
 if p_action='delete' then
  delete from billflow_private.sso_access where user_id=who;
  return jsonb_build_object('saved',false,'version',0);
 end if;
 if p_url is null or length(p_url)>2000 or p_url !~ '^https://[^[:space:]/@]+(/[^[:space:]]*)?$' or p_username is null or length(p_username)>254 or p_password is null or length(p_password)>1000 then raise exception 'INVALID_CREDENTIALS';end if;
 contents:=jsonb_build_object('url',trim(p_url),'username',trim(p_username),'password',p_password);
 stamp:=clock_timestamp();rev:=nextval('billflow_private.sso_access_version');
 if row.user_id is null then
  secret:=vault.create_secret(contents::text,null,'BillFlow personal SSO access');
  insert into billflow_private.sso_access(user_id,secret_id,version,updated_at) values(who,secret,rev,stamp);
 else
  perform vault.update_secret(row.secret_id,contents::text);
  update billflow_private.sso_access set version=rev,updated_at=stamp where user_id=who;
 end if;
 return jsonb_build_object('saved',true,'version',rev,'updatedAt',stamp);
end $$;
revoke all on function billflow_private.sso_access_manage(text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function billflow_private.sso_access_manage(text,text,text,text,bigint) to authenticated;
create or replace function public.billflow_sso_access(p_action text,p_url text default '',p_username text default '',p_password text default '',p_version bigint default null)
returns jsonb language sql security invoker set search_path='' as $$select billflow_private.sso_access_manage(p_action,p_url,p_username,p_password,p_version);$$;
revoke all on function public.billflow_sso_access(text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.billflow_sso_access(text,text,text,text,bigint) to authenticated;
commit;
