begin;
do $$
declare r public.billflow_ledgers%rowtype; p jsonb; original_emp jsonb; changed jsonb; bad jsonb;
begin
 select * into r from public.billflow_ledgers where owner='978bc5a3-50bd-45e3-bef8-4aca3f5bfa44'::uuid for update;
 if r.owner is null or jsonb_array_length(r.payload->'employees')=0 then raise exception 'TEST_EMPLOYEE_REQUIRED';end if;
 original_emp:=r.payload->'employees'->0;
 changed:=original_emp||jsonb_build_object('title','นาย','nationalId','0123456789012','birthDate','2000-02-29');
 p:=jsonb_set(r.payload,'{employees,0}',changed);
 update public.billflow_ledgers set payload=p where owner=r.owner;
 if (select payload#>>'{employees,0,nationalId}' from public.billflow_ledgers where owner=r.owner)<>'0123456789012' then raise exception 'IDENTITY_NOT_SAVED';end if;
 p:=jsonb_set(p,'{employees,0}',changed-'title'-'nationalId'-'birthDate');
 update public.billflow_ledgers set payload=p where owner=r.owner;
 if (select payload#>>'{employees,0,birthDate}' from public.billflow_ledgers where owner=r.owner)<>'2000-02-29' then raise exception 'LEGACY_CLIENT_LOST_IDENTITY';end if;
 for bad in select value from jsonb_array_elements('[{"nationalId":"123"},{"birthDate":"2001-02-29"},{"birthDate":"9999-01-01"},{"title":null}]'::jsonb) loop
  begin
   update public.billflow_ledgers set payload=jsonb_set(p,'{employees,0}',changed||bad) where owner=r.owner;
   raise exception 'INVALID_IDENTITY_ACCEPTED';
  exception when others then
   if sqlerrm not in ('EMPLOYEE_IDENTITY_INVALID','EMPLOYEE_NATIONAL_ID_INVALID','EMPLOYEE_BIRTH_DATE_INVALID') then raise;end if;
  end;
 end loop;
 update public.billflow_ledgers set payload=jsonb_set(p,'{employees,0}',changed||'{"title":"","nationalId":"","birthDate":""}'::jsonb) where owner=r.owner;
 if (select payload#>>'{employees,0,nationalId}' from public.billflow_ledgers where owner=r.owner)<>'' then raise exception 'IDENTITY_CLEAR_FAILED';end if;
end $$;
rollback;
