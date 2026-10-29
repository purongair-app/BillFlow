begin;
-- Expose only the requesting account's matching photo and name from the owner's directory.
create function billflow_private.my_profile() returns jsonb language plpgsql security definer set search_path='' as $$
declare boss uuid; email text; result jsonb; matches integer;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED';end if;
 select lower(u.email) into email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
 select owner into boss from billflow_private.workspace where id=1;
 select count(*) into matches from public.billflow_ledgers l cross join lateral jsonb_array_elements(coalesce(l.payload->'employees','[]'::jsonb)) e
 where l.owner=boss and (e->>'userId'=auth.uid()::text or (coalesce(e->>'userId','')='' and lower(trim(e->>'loginEmail'))=email)) and e->>'active'='true';
 if matches<>1 then select jsonb_build_object('name',display_name) into result from public.billflow_members where user_id=auth.uid();return coalesce(result,'{}'::jsonb);end if;
 select jsonb_build_object('name',e->>'name','photo',case when length(e->>'photo')<=100000 and e->>'photo' ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' then e->>'photo' else null end) into result
 from public.billflow_ledgers l cross join lateral jsonb_array_elements(coalesce(l.payload->'employees','[]'::jsonb)) e
 where l.owner=boss and (e->>'userId'=auth.uid()::text or (coalesce(e->>'userId','')='' and lower(trim(e->>'loginEmail'))=email)) and e->>'active'='true';
 return coalesce(result,'{}'::jsonb);
end $$;
create function public.billflow_my_profile() returns jsonb language sql security invoker set search_path='' as $$select billflow_private.my_profile();$$;
revoke all on function billflow_private.my_profile(),public.billflow_my_profile() from public,anon;
grant execute on function billflow_private.my_profile(),public.billflow_my_profile() to authenticated;
commit;
