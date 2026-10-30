begin;
create or replace function billflow_private.my_profile() returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); boss uuid; own_email text; account_name text; member_name text; item jsonb; matches integer; result jsonb;
begin
 if who is null then raise exception 'UNAUTHORIZED';end if;
 select lower(u.email),left(coalesce(u.raw_user_meta_data->>'full_name',''),150) into own_email,account_name from auth.users u where u.id=who and u.email_confirmed_at is not null;
 if own_email is null then raise exception 'UNAUTHORIZED';end if;
 select display_name into member_name from public.billflow_members where user_id=who;
 select owner into boss from billflow_private.workspace where id=1;
 select count(*) into matches from public.billflow_ledgers l cross join lateral jsonb_array_elements(coalesce(l.payload->'employees','[]'::jsonb)) e
 where l.owner=boss and (e->>'userId'=who::text or (coalesce(e->>'userId','')='' and lower(trim(e->>'loginEmail'))=own_email)) and e->>'active'='true';
 result:=jsonb_build_object('email',own_email,'name',coalesce(nullif(trim(account_name),''),member_name,''),'linked',false,'linkStatus',case when matches>1 then 'ambiguous' else 'unlinked' end);
 if matches<>1 then return result;end if;
 select e into item from public.billflow_ledgers l cross join lateral jsonb_array_elements(coalesce(l.payload->'employees','[]'::jsonb)) e
 where l.owner=boss and (e->>'userId'=who::text or (coalesce(e->>'userId','')='' and lower(trim(e->>'loginEmail'))=own_email)) and e->>'active'='true';
 return result||jsonb_build_object('linked',true,'linkStatus','linked','employeeId',item->>'id','code',item->>'code','name',item->>'name','position',item->>'position',
 'phone',item->>'phone','address',item->>'address','bankName',item->>'bankName','bankAccountName',item->>'bankAccountName','bankAccountNumber',item->>'bankAccountNumber',
 'photo',case when length(item->>'photo')<=100000 and item->>'photo' ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' then item->>'photo' else null end);
end $$;
revoke all on function billflow_private.my_profile() from public,anon;
grant execute on function billflow_private.my_profile() to authenticated;
commit;
