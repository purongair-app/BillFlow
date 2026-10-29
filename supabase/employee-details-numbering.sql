begin;
do $patch$declare f text;begin
 f:=pg_get_functiondef('billflow_private.project_payload(jsonb,text[])'::regprocedure);
 if position('''numbering''' in f)=0 then f:=replace(f,'''audit'',''[]''::jsonb','''numbering'',coalesce(p->''numbering'',''{}''::jsonb),''audit'',''[]''::jsonb');execute f;end if;
 f:=pg_get_functiondef('billflow_private.save_workspace(jsonb,bigint)'::regprocedure);
 if position('''numbering''' in f)=0 then f:=replace(f,'foreach k in array array[''business''','foreach k in array array[''numbering'',''business''');execute f;end if;
 f:=pg_get_functiondef('billflow_private.ledger_usage()'::regprocedure);
 if position('''numbering''' in f)=0 then f:=replace(f,'if baseline->''business'' is distinct from', 'if baseline->''numbering'' is distinct from new.payload->''numbering'' then perform billflow_private.record_usage(''update'',''numbering'',new.owner::text,''แก้ไขรูปแบบรหัสและเลขเอกสาร'',new.owner,''database'',jsonb_build_object(''revision'',new.revision));end if; if baseline->''business'' is distinct from');execute f;end if;
f:=pg_get_functiondef('billflow_private.save_workspace(jsonb,bigint)'::regprocedure);if position('if k=''numbering'' and not' in f)=0 then f:=replace(f,'if k=''bookkeeping''','if k=''numbering'' and not(new_payload?''numbering'') then continue;end if; if k=''bookkeeping''');execute f;end if;
end $patch$;
create function billflow_private.validate_employee_details_numbering() returns trigger language plpgsql security invoker set search_path='' as $$
declare base jsonb:='{}'; emp jsonb; prior jsonb; updated jsonb:='[]'; k text; max_len integer; rules jsonb; rule jsonb; item record;
begin
 if tg_op='UPDATE' then base:=old.payload;end if;
 if base?'numbering' and not(new.payload?'numbering') then new.payload:=jsonb_set(new.payload,'{numbering}',base->'numbering');end if;
 if coalesce(new.payload->'numbering','{}') is distinct from coalesce(base->'numbering','{}') then
  if auth.uid() is null or not coalesce((public.billflow_access_only()->>'owner')::boolean,false) then raise exception 'NUMBERING_OWNER_ONLY';end if;
 end if;
 rules:=coalesce(new.payload->'numbering','{}');if jsonb_typeof(rules) is distinct from 'object' then raise exception 'NUMBERING_INVALID';end if;
 for item in select key,value from jsonb_each(rules) loop
  rule:=item.value;
  if item.key not in ('income','expense','transfer','payroll','journal','employee','customer','creditor') or jsonb_typeof(rule) is distinct from 'object' or jsonb_typeof(rule->'prefix') is distinct from 'string' or jsonb_typeof(rule->'digits') is distinct from 'number' or jsonb_typeof(rule->'start') is distinct from 'number' or coalesce(rule->>'prefix','') !~ '^[-A-Za-z0-9ก-๙._]{1,16}$' or coalesce(rule->>'year','') not in ('none','be','beShort','ad','adShort') or jsonb_typeof(rule->'month') is distinct from 'boolean' or not coalesce(rule->>'prefixSeparator'=any(array['','-','/','_']),false) or not coalesce(rule->>'sequenceSeparator'=any(array['','-','/','_']),false) or coalesce(rule->>'digits','') !~ '^\d+$' or (rule->>'digits')::integer not between 2 and 10 or coalesce(rule->>'start','') !~ '^\d+$' or (rule->>'start')::numeric not between 1 and 9999999999 then raise exception 'NUMBERING_INVALID';end if;
 end loop;
 if new.payload?'employees' then
  if jsonb_typeof(new.payload->'employees') is distinct from 'array' then raise exception 'EMPLOYEE_DETAILS_INVALID';end if;
  for emp in select value from jsonb_array_elements(new.payload->'employees') loop
   select value into prior from jsonb_array_elements(coalesce(base->'employees','[]')) where value->>'id'=emp->>'id';
   foreach k in array array['address','phone','bankName','bankAccountName','bankAccountNumber'] loop
    if prior?k and not(emp?k) then emp:=jsonb_set(emp,array[k],prior->k);end if;
    max_len:=case k when 'address' then 1000 when 'phone' then 40 when 'bankName' then 100 when 'bankAccountName' then 150 else 50 end;
    if emp?k and (jsonb_typeof(emp->k) is distinct from 'string' or length(emp->>k)>max_len) then raise exception 'EMPLOYEE_DETAILS_INVALID';end if;
   end loop;
   if coalesce(emp->>'phone','')<>'' and emp->>'phone' !~ '^[+0-9() .-]{6,40}$' then raise exception 'EMPLOYEE_PHONE_INVALID';end if;
   if coalesce(emp->>'bankAccountNumber','')<>'' and (emp->>'bankAccountNumber' !~ '^[0-9 -]{5,50}$' or length(regexp_replace(emp->>'bankAccountNumber','[^0-9]','','g'))<5 or coalesce(trim(emp->>'bankName'),'')='' or coalesce(trim(emp->>'bankAccountName'),'')='') then raise exception 'EMPLOYEE_BANK_INVALID';end if;
   if jsonb_typeof(emp->'code') is distinct from 'string' or coalesce(emp->>'code','') !~ '^[-A-Za-z0-9ก-๙._/]{1,32}$' then raise exception 'EMPLOYEE_CODE_INVALID';end if;
   updated:=updated||jsonb_build_array(emp);
  end loop;
  if (select count(distinct upper(x->>'code')) from jsonb_array_elements(updated) x)<>jsonb_array_length(updated) then raise exception 'EMPLOYEE_CODE_DUPLICATE';end if;
  new.payload:=jsonb_set(new.payload,'{employees}',updated);
 end if;
 return new;
end $$;
revoke all on function billflow_private.validate_employee_details_numbering() from public,anon,authenticated;
create trigger billflow_validate_employee_details_numbering before insert or update on public.billflow_ledgers for each row execute function billflow_private.validate_employee_details_numbering();
commit;
