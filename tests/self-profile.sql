begin;
do $test$
declare boss uuid; candidate uuid; outsider uuid; employee_key text:=gen_random_uuid()::text; p jsonb; result jsonb;
begin
 select owner into boss from billflow_private.workspace where id=1;
 select payload into p from public.billflow_ledgers where owner=boss;
 select u.id into candidate from auth.users u where u.email_confirmed_at is not null
 and not exists(select 1 from jsonb_array_elements(coalesce(p->'employees','[]')) e where e->>'userId'=u.id::text or lower(trim(e->>'loginEmail'))=lower(u.email)) limit 1;
 if candidate is null then raise exception 'NO_UNLINKED_ACCOUNT_FOR_PROFILE_TEST';end if;
 perform set_config('request.jwt.claim.sub',boss::text,true);
 update public.billflow_ledgers set payload=jsonb_set(payload,'{employees}',coalesce(payload->'employees','[]')||jsonb_build_array(jsonb_build_object('id',employee_key,'code','SELFTEST-'||left(employee_key,8),'name','Profile access test','position','Test','active',true,'userId',candidate::text,'phone','0800000000','address','Self-only address','bankName','Test bank','bankAccountName','Test account','bankAccountNumber','00000001'))) where owner=boss;
 perform set_config('request.jwt.claim.sub',candidate::text,true);
 result:=public.billflow_my_profile();
 if result->>'employeeId' is distinct from employee_key or result->>'phone'<>'0800000000' or result->>'bankAccountNumber'<>'00000001' or result->>'linked'<>'true' then raise exception 'LINKED_SELF_PROFILE_FAILED';end if;
 select id into outsider from auth.users where email_confirmed_at is not null and id<>candidate limit 1;
 if outsider is not null then
 perform set_config('request.jwt.claim.sub',outsider::text,true);result:=public.billflow_my_profile();
 if result->>'employeeId'=employee_key or result->>'phone'='0800000000' then raise exception 'OTHER_ACCOUNT_DATA_LEAK';end if;
 end if;
end $test$;
select 'employee identity link, own contact/bank fields and cross-account isolation passed; fixture rolled back' as validation;
rollback;