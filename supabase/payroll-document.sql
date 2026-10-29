begin;
do $patch$
declare f text; form_block text;
begin
 f:=pg_get_functiondef('billflow_private.validate_payroll()'::regprocedure);
 if position('PAYROLL_FORM_INVALID' in f)=0 then
 f:=replace(f,'is_void boolean;','is_void boolean; form_doc jsonb; form_days numeric; form_sum numeric; form_key text;');
 form_block:=$block$
  if exists(select 1 from jsonb_array_elements(new.payload->'payroll') doc_record where nullif(trim(doc_record->'form'->>'documentNo'),'') is not null group by upper(trim(doc_record->'form'->>'documentNo')) having count(*)>1) then raise exception 'PAYROLL_DOCUMENT_DUPLICATE';end if;
  if p?'form' and p->'form'<>'null'::jsonb then
   form_doc:=p->'form';form_days:=(p->>'periodEnd')::date-(p->>'periodStart')::date+1;form_sum:=0;
   if jsonb_typeof(form_doc) is distinct from 'object' or jsonb_typeof(form_doc->'documentNo') is distinct from 'string' or length(trim(form_doc->>'documentNo')) not between 1 and 64 then raise exception 'PAYROLL_FORM_INVALID';end if;
   foreach form_key in array array['department','managerName','managerPosition','footer'] loop
    if jsonb_typeof(form_doc->form_key) is distinct from 'string' or length(form_doc->>form_key)>(case form_key when 'department' then 100 when 'managerPosition' then 100 when 'managerName' then 150 else 500 end) then raise exception 'PAYROLL_FORM_INVALID';end if;
   end loop;
   if coalesce(form_doc->>'issueDate','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((form_doc->>'issueDate')::date,'YYYY-MM-DD')<>form_doc->>'issueDate' then raise exception 'PAYROLL_FORM_DATE';end if;
   foreach form_key in array array['monthlySalary','guaranteeAmount'] loop
    if coalesce(form_doc->>form_key,'') !~ '^\d+$' or (form_doc->>form_key)::numeric>1000000000000 then raise exception 'PAYROLL_FORM_AMOUNT';end if;
   end loop;
   foreach form_key in array array['restDays','leaveDays','absenceDays','workedDays'] loop
    if coalesce(form_doc->>form_key,'') !~ '^\d+(\.\d+)?$' or (form_doc->>form_key)::numeric>form_days then raise exception 'PAYROLL_FORM_DAYS';end if;form_sum:=form_sum+(form_doc->>form_key)::numeric;
   end loop;
   if form_sum>form_days+0.000001 then raise exception 'PAYROLL_FORM_DAYS';end if;
  end if;
  if p?'sourceDocumentId' and coalesce(p->>'sourceDocumentId','') !~ '^[a-f0-9-]{36}$' then raise exception 'PAYROLL_SOURCE';end if;
  if p?'file' and p->'file'<>'null'::jsonb and (coalesce(p->'file'->>'id','') !~ '^[a-f0-9-]{36}$' or jsonb_typeof(p->'file'->'name') is distinct from 'string' or length(p->'file'->>'name')>250) then raise exception 'PAYROLL_FILE';end if;
$block$;
 f:=replace(f,'if jsonb_typeof(p->''earnings'')',form_block||'if jsonb_typeof(p->''earnings'')');
 f:=replace(f,'then raise exception ''PAYROLL_LINE'';end if;', $line$then raise exception 'PAYROLL_LINE';end if;
   if l?'quantity' or l?'unitRate' then
    if coalesce(l->>'quantity','') !~ '^\d+(\.\d+)?$' or (l->>'quantity')::numeric>1000000 or coalesce(l->>'unitRate','') !~ '^\d+$' or (l->>'unitRate')::numeric>1000000000000 or round((l->>'quantity')::numeric*(l->>'unitRate')::numeric)<>(l->>'amount')::numeric then raise exception 'PAYROLL_LINE_CALCULATION';end if;
   end if;$line$);execute f;
 end if;
 f:=pg_get_functiondef('public.billflow_confirm_inbox(uuid,text,jsonb,bigint)'::regprocedure);
 if position('''payroll''' in f)=0 then
 f:=replace(f,'''entry'',''debt''','''entry'',''debt'',''payroll''');
 f:=replace(f,'then ''entries'' else ''debts'' end','then ''entries'' when p_target=''payroll'' then ''payroll'' else ''debts'' end');
 f:=replace(f,'next_revision:=public.billflow_save_ledger',$confirm$
 if p_target='payroll' and (item->>'status' is distinct from 'draft' or item->>'sourceDocumentId' is distinct from p_id::text or jsonb_typeof(item->'payments') is distinct from 'array' or jsonb_array_length(item->'payments')<>0 or coalesce(new_payload->'entries','[]') is distinct from coalesce(old_payload->'entries','[]') or coalesce(new_payload->'debts','[]') is distinct from coalesce(old_payload->'debts','[]')) then raise exception 'PAYROLL_IMPORT_DRAFT_ONLY';end if;
 next_revision:=public.billflow_save_ledger$confirm$);execute f;
 end if;
end $patch$;
commit;
