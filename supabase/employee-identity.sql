-- Preserve identity fields from older clients and validate them without changing access rights.
create or replace function billflow_private.validate_employee_identity() returns trigger
language plpgsql security invoker set search_path='' as $$
declare base jsonb:='{}'; emp jsonb; prior jsonb; updated jsonb:='[]'; k text; dob date; max_len integer;
begin
 if tg_op='UPDATE' then base:=old.payload;end if;
 if not(new.payload?'employees') then return new;end if;
 if jsonb_typeof(new.payload->'employees') is distinct from 'array' then raise exception 'EMPLOYEE_IDENTITY_INVALID';end if;
 for emp in select value from jsonb_array_elements(new.payload->'employees') loop
  select value into prior from jsonb_array_elements(coalesce(base->'employees','[]')) where value->>'id'=emp->>'id';
  foreach k in array array['title','nationalId','birthDate'] loop
   if prior?k and not(emp?k) then emp:=jsonb_set(emp,array[k],prior->k);end if;
   max_len:=case k when 'title' then 50 when 'nationalId' then 13 else 10 end;
   if emp?k and (jsonb_typeof(emp->k) is distinct from 'string' or length(emp->>k)>max_len) then raise exception 'EMPLOYEE_IDENTITY_INVALID';end if;
  end loop;
  if coalesce(emp->>'nationalId','')<>'' and emp->>'nationalId' !~ '^[0-9]{13}$' then raise exception 'EMPLOYEE_NATIONAL_ID_INVALID';end if;
  if coalesce(emp->>'birthDate','')<>'' then
   if emp->>'birthDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'EMPLOYEE_BIRTH_DATE_INVALID';end if;
   begin dob:=(emp->>'birthDate')::date;exception when others then raise exception 'EMPLOYEE_BIRTH_DATE_INVALID';end;
   if dob>(current_timestamp at time zone 'Asia/Bangkok')::date then raise exception 'EMPLOYEE_BIRTH_DATE_INVALID';end if;
  end if;
  updated:=updated||jsonb_build_array(emp);
 end loop;
 new.payload:=jsonb_set(new.payload,'{employees}',updated);
 return new;
end $$;
revoke all on function billflow_private.validate_employee_identity() from public,anon,authenticated;
create trigger billflow_validate_employee_identity before insert or update on public.billflow_ledgers
 for each row execute function billflow_private.validate_employee_identity();
