-- Read-only snapshot of deployed reset/validation functions for isolated regression tests.
CREATE OR REPLACE FUNCTION billflow_private.begin_reset()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare who uuid:=auth.uid(); sid uuid:=(auth.jwt()->>'session_id')::uuid; mail text; rev bigint; c billflow_private.reset_challenges;
begin
 if who is null or not exists(select 1 from billflow_private.workspace where owner=who) then raise exception 'OWNER_ONLY';end if;
 
 if exists(select 1 from public.billflow_ledgers where owner=who and payload->'bookkeeping' is not null and payload->'bookkeeping'<>'null'::jsonb) then raise exception 'ACCOUNTING_RESET_NOT_READY';end if;

 if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=who and (not_after is null or not_after>now())) then raise exception 'UNAUTHORIZED';end if;
 -- Serialize requests so the cooldown cannot be bypassed by concurrent calls.
 perform pg_advisory_xact_lock(hashtextextended('billflow-reset:'||who::text,0));
 select email into mail from auth.users where id=who and email_confirmed_at is not null;
 if coalesce(mail,'')='' then raise exception 'EMAIL_REQUIRED';end if;
 if exists(select 1 from billflow_private.reset_challenges where owner=who and created_at>now()-interval '60 seconds') or (select count(*) from billflow_private.reset_challenges where owner=who and created_at>now()-interval '1 hour')>=5 then raise exception 'RESET_RATE_LIMIT';end if;
 select coalesce(revision,0) into rev from public.billflow_ledgers where owner=who;
 update billflow_private.reset_challenges set cancelled=true where owner=who and used_at is null;
 insert into billflow_private.reset_challenges(owner,session_id,email,revision) values(who,sid,mail,coalesce(rev,0)) returning * into c;
 return jsonb_build_object('id',c.id,'email',mail,'expiresAt',c.expires_at,'phrase','ล้างข้อมูลทั้งหมด');
end $function$
;
CREATE OR REPLACE FUNCTION billflow_private.confirm_reset(p_id uuid, p_code text, p_phrase text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare who uuid:=auth.uid(); sid uuid:=(auth.jwt()->>'session_id')::uuid; c billflow_private.reset_challenges; mail text; token text; sent timestamptz; rev bigint; paths text[]; job uuid; line_enabled boolean;
begin
 if who is null or not exists(select 1 from billflow_private.workspace where owner=who) then raise exception 'OWNER_ONLY';end if;
 
 if exists(select 1 from public.billflow_ledgers where owner=who and payload->'bookkeeping' is not null and payload->'bookkeeping'<>'null'::jsonb) then raise exception 'ACCOUNTING_RESET_NOT_READY';end if;

 if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=who and (not_after is null or not_after>now())) then raise exception 'UNAUTHORIZED';end if;
 select * into c from billflow_private.reset_challenges where id=p_id and owner=who and session_id=sid for update;
 if c.id is null or c.cancelled or c.used_at is not null or c.expires_at<=now() or c.attempts>=5 then return jsonb_build_object('ok',false,'code','RESET_EXPIRED');end if;
 if p_phrase is distinct from 'ล้างข้อมูลทั้งหมด' then update billflow_private.reset_challenges set attempts=attempts+1 where id=c.id;return jsonb_build_object('ok',false,'code','PHRASE_MISMATCH');end if;
 select email,reauthentication_token,reauthentication_sent_at into mail,token,sent from auth.users where id=who and email_confirmed_at is not null;
 -- Supabase Auth reauthentication OTP is SHA-224(email + OTP), as implemented by supabase/auth.
 -- Require a nonce sent AFTER this challenge, to the same confirmed account email.
 if mail is distinct from c.email or coalesce(p_code,'') !~ '^[0-9]{6,10}$' or sent is null or sent<c.created_at or sent<now()-interval '10 minutes' or coalesce(token,'')='' or token<>encode(extensions.digest(convert_to(mail||p_code,'UTF8'),'sha224'),'hex') then
  update billflow_private.reset_challenges set attempts=attempts+1 where id=c.id;return jsonb_build_object('ok',false,'code','OTP_INVALID');
 end if;
 lock table public.billflow_line_inbox,public.billflow_line_outbox in share row exclusive mode;
 if exists(select 1 from public.billflow_line_inbox where owner=who and status='processing' and processing_at>now()-interval '3 minutes') or exists(select 1 from public.billflow_line_outbox where owner=who and status='processing' and claimed_at>now()-interval '2 minutes') then return jsonb_build_object('ok',false,'code','WORK_IN_PROGRESS');end if;
 select revision into rev from public.billflow_ledgers where owner=who for update;
 if coalesce(rev,0)<>c.revision then return jsonb_build_object('ok',false,'code','CONFLICT');end if;
 select coalesce(array_agg(name),'{}') into paths from storage.objects where bucket_id='billflow-receipts' and split_part(name,'/',1)=who::text;
 insert into billflow_private.reset_cleanup(owner,paths,status) values(who,paths,case when cardinality(paths)=0 then 'done' else 'pending' end) returning id into job;
 -- Stop delivery before resetting the ledger, preventing delete notifications from being generated.
 select enabled into line_enabled from public.billflow_line_settings where owner=who for update; update public.billflow_line_settings set enabled=false where owner=who;
 delete from public.billflow_line_inbox where owner=who;
 delete from public.billflow_line_outbox where owner=who;
 if rev is null then
  insert into public.billflow_ledgers(owner,payload,revision) values(who,billflow_private.default_payload(),1);rev:=1;
 else
  update public.billflow_ledgers set payload=billflow_private.default_payload(),revision=revision+1,updated_at=now() where owner=who returning revision into rev;
 end if;
 if line_enabled is not null then update public.billflow_line_settings set enabled=line_enabled where owner=who;end if; update billflow_private.reset_challenges set used_at=now() where id=c.id;
 return jsonb_build_object('ok',true,'revision',rev,'cleanupId',job,'filesPending',cardinality(paths));
end $function$
;
CREATE OR REPLACE FUNCTION billflow_private.default_payload()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$select '{"business":"ร้านของฉัน","accounts":[{"id":"cash","name":"เงินสด","opening":0},{"id":"bank","name":"บัญชีธนาคาร","opening":0}],"entries":[],"debts":[],"contacts":[],"employees":[],"categories":["ค่าบริการ","ขายสินค้า","อะไหล่และวัสดุ","ค่าเดินทาง","เงินเดือน","ค่าน้ำค่าไฟ","ค่าเช่า","อื่น ๆ"],"budgets":[],"audit":[],"accountHolders":[],"documentSources":[]}'::jsonb;$function$
;
CREATE OR REPLACE FUNCTION billflow_private.reset_cleanup_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not exists(select 1 from billflow_private.workspace where owner=auth.uid()) then raise exception 'OWNER_ONLY';end if;
 return (select jsonb_build_object('pending',coalesce(sum(cardinality(paths)),0),'failed',coalesce(bool_or(status='failed'),false)) from billflow_private.reset_cleanup where owner=auth.uid() and status<>'done');
end $function$
;
CREATE OR REPLACE FUNCTION billflow_private.validate_bill_details()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare section text; e jsonb; prior jsonb; result jsonb;
begin
 foreach section in array array['entries','debts'] loop
  result:='[]'::jsonb;
  for e in select value from jsonb_array_elements(new.payload->section) loop
   -- Keep details when an older browser does not send the new field.
   if tg_op='UPDATE' and not(e?'billDetails') then
    select value->'billDetails' into prior from jsonb_array_elements(old.payload->section) where value->>'id'=e->>'id';
    if prior is not null then e:=jsonb_set(e,'{billDetails}',prior);end if;
   end if;
   perform billflow_private.check_bill_details(e->'billDetails',(e->>'amount')::numeric,e->>'type',new.payload#>'{bookkeeping,chart}');
   result:=result||jsonb_build_array(e);
  end loop;
  new.payload:=jsonb_set(new.payload,array[section],result);
 end loop;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION billflow_private.validate_bookkeeping()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare b jsonb; a jsonb; j jsonb; l jsonb; item jsonb; original jsonb; codes text[]; cashcodes text[]; dr numeric; cr numeric;
begin
 -- An older open browser must not erase accounting records it does not know about.
 if tg_op='UPDATE' and old.payload?'bookkeeping' and not(new.payload?'bookkeeping') then new.payload:=jsonb_set(new.payload,'{bookkeeping}',old.payload->'bookkeeping');end if;
 if not(new.payload?'bookkeeping') or new.payload->'bookkeeping'='null'::jsonb then
  if tg_op='UPDATE' and old.payload->'bookkeeping' is not null and old.payload->'bookkeeping'<>'null'::jsonb then raise exception 'BOOKKEEPING_REMOVAL_FORBIDDEN';end if;return new;
 end if;
 b:=new.payload->'bookkeeping';
 if jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(b->'chart') is distinct from 'array' or jsonb_array_length(b->'chart') not between 1 and 2000 or jsonb_typeof(b->'journals') is distinct from 'array' or jsonb_typeof(b->'allocations') is distinct from 'object' then raise exception 'INVALID_BOOKKEEPING';end if;
 if coalesce(b->>'openingDate','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((b->>'openingDate')::date,'YYYY-MM-DD')<>b->>'openingDate' then raise exception 'INVALID_OPENING_DATE';end if;
 if exists(select 1 from jsonb_array_elements(new.payload->'accounts') x where (x->>'opening')::numeric<>0) and exists(select 1 from jsonb_array_elements(new.payload->'entries') x where x->>'date'<b->>'openingDate') then raise exception 'OPENING_AFTER_ENTRIES';end if;
 select array_agg(x->>'code') into codes from jsonb_array_elements(b->'chart') x;
 if cardinality(codes)<>(select count(distinct x) from unnest(codes) x) or not('390000'=any(codes)) then raise exception 'DUPLICATE_ACCOUNT_CODE';end if;
 for a in select value from jsonb_array_elements(b->'chart') loop
  if coalesce(a->>'code','') !~ '^\d{4,10}$' or jsonb_typeof(a->'name') is distinct from 'string' or length(trim(a->>'name')) not between 1 and 150 or coalesce(a->>'group','') not in ('asset','liability','equity','income','expense') or coalesce(a->>'normal','') not in ('debit','credit') or jsonb_typeof(a->'section') is distinct from 'string' or length(a->>'section')>150 or jsonb_typeof(a->'active') is distinct from 'boolean' then raise exception 'INVALID_CHART_ACCOUNT';end if;
  if a?'cashFlow' and a->'cashFlow'<>'null'::jsonb and coalesce(a->>'cashFlow','') not in ('operating','investing','financing') then raise exception 'INVALID_CASH_FLOW_CLASS';end if;
  if coalesce(a->>'cashAccountId','')<>'' and a->>'group'<>'asset' then raise exception 'INVALID_CASH_ACCOUNT';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(b->'chart') x where coalesce(x->>'cashAccountId','')<>'')<>(select count(distinct x->>'cashAccountId') from jsonb_array_elements(b->'chart') x where coalesce(x->>'cashAccountId','')<>'') then raise exception 'DUPLICATE_CASH_MAPPING';end if;
 select coalesce(array_agg(x->>'code'),'{}') into cashcodes from jsonb_array_elements(b->'chart') x where coalesce(x->>'cashAccountId','')<>'';
 for item in select value from jsonb_each(b->'allocations') loop
  if jsonb_typeof(item) is distinct from 'object' or not coalesce(item->>'code'=any(codes),false) or item->>'code'=any(cashcodes) then raise exception 'INVALID_ALLOCATION';end if;
  if exists(select 1 from jsonb_each(item) x where x.key not in ('code','department','project','reference','source','note') or jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>500) then raise exception 'INVALID_ALLOCATION_DETAIL';end if;
 end loop;
 if jsonb_array_length(b->'journals')<>(select count(distinct x->>'id') from jsonb_array_elements(b->'journals') x) or jsonb_array_length(b->'journals')<>(select count(distinct upper(x->>'no')) from jsonb_array_elements(b->'journals') x) then raise exception 'DUPLICATE_JOURNAL';end if;
 for j in select value from jsonb_array_elements(b->'journals') loop
  if jsonb_typeof(j->'id') is distinct from 'string' or length(j->>'id') not between 1 and 100 or jsonb_typeof(j->'no') is distinct from 'string' or length(trim(j->>'no')) not between 1 and 64 or coalesce(j->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((j->>'date')::date,'YYYY-MM-DD')<>j->>'date' or coalesce(j->>'kind','') not in ('sales','purchase','general','adjustment','closing') or jsonb_typeof(j->'memo') is distinct from 'string' or length(trim(j->>'memo')) not between 1 and 500 or jsonb_typeof(j->'lines') is distinct from 'array' or jsonb_array_length(j->'lines') not between 2 and 100 then raise exception 'INVALID_JOURNAL';end if;
  if exists(select 1 from unnest(array['reference','source','contact']) k where jsonb_typeof(j->k) is distinct from 'string' or length(j->>k)>500) then raise exception 'INVALID_JOURNAL_SOURCE';end if;
  dr:=0;cr:=0;
  for l in select value from jsonb_array_elements(j->'lines') loop
   if not coalesce(l->>'code'=any(codes),false) or l->>'code'=any(cashcodes) or coalesce(l->>'debit','') !~ '^\d+$' or coalesce(l->>'credit','') !~ '^\d+$' or (l->>'debit')::numeric>100000000000000 or (l->>'credit')::numeric>100000000000000 or ((l->>'debit')::numeric>0)=((l->>'credit')::numeric>0) or jsonb_typeof(l->'detail') is distinct from 'string' or length(l->>'detail')>500 then raise exception 'INVALID_JOURNAL_LINE';end if;
   dr:=dr+(l->>'debit')::numeric;cr:=cr+(l->>'credit')::numeric;
  end loop;
  if dr<>cr or dr<=0 or dr>9007199254740991 then raise exception 'UNBALANCED_JOURNAL';end if;
  if j?'file' and j->'file'<>'null'::jsonb and (coalesce(j->'file'->>'id','') !~ '^[a-f0-9-]{36}$' or jsonb_typeof(j->'file'->'name') is distinct from 'string') then raise exception 'INVALID_JOURNAL_FILE';end if;
  if coalesce(j->>'reversalOf','')<>'' then
   select value into original from jsonb_array_elements(b->'journals') where value->>'id'=j->>'reversalOf';
   if original is null or original?'reversalOf' or j->>'date'<original->>'date' or jsonb_array_length(j->'lines')<>jsonb_array_length(original->'lines') or (select count(*) from jsonb_array_elements(b->'journals') x where x->>'reversalOf'=j->>'reversalOf')<>1 then raise exception 'INVALID_REVERSAL';end if;
   if exists(select 1 from jsonb_array_elements(j->'lines') with ordinality x(value,i) where x.value->>'code'<>original->'lines'->(i::integer-1)->>'code' or x.value->>'debit'<>original->'lines'->(i::integer-1)->>'credit' or x.value->>'credit'<>original->'lines'->(i::integer-1)->>'debit') then raise exception 'INVALID_REVERSAL_LINES';end if;
  end if;
 end loop;
 if tg_op='UPDATE' and old.payload->'bookkeeping' is not null then
  for a in select value from jsonb_array_elements(coalesce(old.payload->'bookkeeping'->'chart','[]'::jsonb)) loop
   if not exists(select 1 from jsonb_array_elements(b->'chart') x where x->>'code'=a->>'code' and x->>'group'=a->>'group' and x->>'normal'=a->>'normal' and coalesce(x->>'cashAccountId','')=coalesce(a->>'cashAccountId','')) then raise exception 'CHART_STRUCTURE_IMMUTABLE';end if;
  end loop;
  for j in select value from jsonb_array_elements(coalesce(old.payload->'bookkeeping'->'journals','[]'::jsonb)) loop
   if not exists(select 1 from jsonb_array_elements(b->'journals') x where x=j) then raise exception 'POSTED_JOURNAL_IMMUTABLE';end if;
  end loop;
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION billflow_private.validate_employee_details_numbering()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION billflow_private.validate_employee_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION billflow_private.validate_payroll()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare p jsonb; prev jsonb; x jsonb; px jsonb; e jsonb; prior_entry jsonb; l jsonb; gross numeric; deductions numeric; paid numeric; net numeric; base jsonb:='{}'; payroll_changed boolean; actor_access jsonb; edit_rights text[]; expected_id text; is_void boolean; form_doc jsonb; form_days numeric; form_sum numeric; form_key text;
begin
 if tg_op='UPDATE' then base:=old.payload;end if;
 -- Older clients preserve payroll and cannot silently erase it.
 if base?'payroll' and not(new.payload?'payroll') then new.payload:=jsonb_set(new.payload,'{payroll}',base->'payroll');end if;
 payroll_changed:=coalesce(base->'payroll','[]') is distinct from coalesce(new.payload->'payroll','[]');
 if payroll_changed then
  if auth.uid() is null then raise exception 'PAYROLL_UNAUTHORIZED';end if;
  actor_access:=public.billflow_access_only();select coalesce(array_agg(value),'{}') into edit_rights from jsonb_array_elements_text(actor_access->'editMenus');
  if not coalesce((actor_access->>'owner')::boolean,false) and not('payroll'=any(edit_rights)) then raise exception 'PAYROLL_FORBIDDEN';end if;
 end if;
 if not(new.payload?'payroll') then return new;end if;
 if jsonb_typeof(new.payload->'payroll') is distinct from 'array' or jsonb_array_length(new.payload->'payroll')>5000 then raise exception 'PAYROLL_INVALID';end if;
 if (select count(*) from jsonb_array_elements(new.payload->'payroll'))<>(select count(distinct record_pl->>'id') from jsonb_array_elements(new.payload->'payroll') record_pl) then raise exception 'PAYROLL_DUPLICATE';end if;
 if exists(select 1 from jsonb_array_elements(new.payload->'payroll') record_pl where record_pl->>'status'<>'cancelled' group by record_pl->>'employeeId',record_pl->>'periodStart',record_pl->>'periodEnd' having count(*)>1) then raise exception 'PAYROLL_DUPLICATE_PERIOD';end if;
 for p in select value from jsonb_array_elements(new.payload->'payroll') loop
  if jsonb_typeof(p->'id') is distinct from 'string' or length(p->>'id') not between 1 and 100 or coalesce(p->>'status','') not in ('draft','approved','cancelled') or coalesce(p->>'basis','') not in ('monthly','daily','hourly') or not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'employees','[]')) emp where emp->>'id'=p->>'employeeId') then raise exception 'PAYROLL_INVALID';end if;
  if exists(select 1 from unnest(array['employeeName','employeeCode','position','note']) k where jsonb_typeof(p->k) is distinct from 'string' or length(p->>k)>500) or length(trim(p->>'employeeName'))=0 then raise exception 'PAYROLL_INVALID_TEXT';end if;
  foreach expected_id in array array['periodStart','periodEnd','dueDate'] loop
   if coalesce(p->>expected_id,'') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p->>expected_id)::date,'YYYY-MM-DD')<>p->>expected_id then raise exception 'PAYROLL_DATE';end if;
  end loop;
  if p->>'periodStart'>p->>'periodEnd' or coalesce(p->>'units','') !~ '^\d+(\.\d+)?$' or (p->>'units')::numeric<=0 or (p->>'units')::numeric>10000 or coalesce(p->>'rate','') !~ '^\d+$' or (p->>'rate')::numeric>1000000000000 or coalesce(p->>'employerSocial','') !~ '^\d+$' or (p->>'employerSocial')::numeric>1000000000000 then raise exception 'PAYROLL_RATE';end if;
  
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
if jsonb_typeof(p->'earnings') is distinct from 'array' or jsonb_typeof(p->'deductions') is distinct from 'array' or jsonb_typeof(p->'payments') is distinct from 'array' or jsonb_array_length(p->'earnings')>50 or jsonb_array_length(p->'deductions')>50 then raise exception 'PAYROLL_LINES';end if;
  gross:=round((p->>'units')::numeric*(p->>'rate')::numeric);deductions:=0;paid:=0;
  for l in select value from jsonb_array_elements((p->'earnings')||(p->'deductions')) loop
   if jsonb_typeof(l->'name') is distinct from 'string' or length(trim(l->>'name')) not between 1 and 150 or coalesce(l->>'amount','') !~ '^\d+$' or (l->>'amount')::numeric>1000000000000 then raise exception 'PAYROLL_LINE';end if;
   if l?'quantity' or l?'unitRate' then
    if coalesce(l->>'quantity','') !~ '^\d+(\.\d+)?$' or (l->>'quantity')::numeric>1000000 or coalesce(l->>'unitRate','') !~ '^\d+$' or (l->>'unitRate')::numeric>1000000000000 or round((l->>'quantity')::numeric*(l->>'unitRate')::numeric)<>(l->>'amount')::numeric then raise exception 'PAYROLL_LINE_CALCULATION';end if;
   end if;
  end loop;
  select gross+coalesce(sum((line_record->>'amount')::numeric),0) into gross from jsonb_array_elements(p->'earnings') line_record;
  for l in select value from jsonb_array_elements(p->'deductions') loop
   if coalesce(l->>'kind','') not in ('tax','social','provident','advance','unpaid','other') then raise exception 'PAYROLL_DEDUCTION';end if;deductions:=deductions+(l->>'amount')::numeric;
  end loop;
  net:=gross-deductions;if gross<=0 or gross>1000000000000 or net<0 then raise exception 'PAYROLL_NET';end if;
  if p->>'status'<>'draft' and (coalesce(p->>'approvalDate','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p->>'approvalDate')::date,'YYYY-MM-DD')<>p->>'approvalDate' or nullif(p->>'approvedAt','')::timestamptz is null) then raise exception 'PAYROLL_APPROVAL';end if;
  if p->>'status'='draft' and jsonb_array_length(p->'payments')>0 then raise exception 'PAYROLL_NOT_APPROVED';end if;
  select value into prev from jsonb_array_elements(coalesce(base->'payroll','[]')) where value->>'id'=p->>'id';
  if prev->>'status' in ('approved','cancelled') then
   if (p-array['payments','status','cancelDate','cancelReason']) is distinct from (prev-array['payments','status','cancelDate','cancelReason']) or p->>'status'='draft' or (prev->>'status'='cancelled' and prev is distinct from p) then raise exception 'PAYROLL_APPROVED_IMMUTABLE';end if;
   for px in select value from jsonb_array_elements(prev->'payments') loop
    select value into x from jsonb_array_elements(p->'payments') where value->>'id'=px->>'id';
    if x is null or (x-array['voidDate','voidReason']) is distinct from (px-array['voidDate','voidReason']) or (px?'voidDate' and px is distinct from x) then raise exception 'PAYROLL_PAYMENT_IMMUTABLE';end if;
   end loop;
  end if;
  for x in select value from jsonb_array_elements(p->'payments') loop
   if length(coalesce(x->>'id','')) not between 1 and 100 or coalesce(x->>'amount','') !~ '^\d+$' or (x->>'amount')::numeric<=0 or (x->>'amount')::numeric>net or coalesce(x->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((x->>'date')::date,'YYYY-MM-DD')<>x->>'date' or x->>'date'<p->>'approvalDate' or coalesce(x->>'method','') not in ('cash','bank','card','other') or not exists(select 1 from jsonb_array_elements(new.payload->'accounts') a where a->>'id'=x->>'account') or exists(select 1 from unnest(array['reference','note']) k where jsonb_typeof(x->k) is distinct from 'string' or length(x->>k)>500) then raise exception 'PAYROLL_PAYMENT';end if;
   if (select count(*) from jsonb_array_elements(new.payload->'payroll') z cross join lateral jsonb_array_elements(z->'payments') q where q->>'id'=x->>'id')<>1 then raise exception 'PAYROLL_DUPLICATE_PAYMENT';end if;
   if x?'voidDate' then
    if coalesce(x->>'voidDate','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((x->>'voidDate')::date,'YYYY-MM-DD')<>x->>'voidDate' or x->>'voidDate'<x->>'date' or length(trim(coalesce(x->>'voidReason',''))) not between 1 and 500 then raise exception 'PAYROLL_VOID';end if;
   else paid:=paid+(x->>'amount')::numeric;end if;
   foreach is_void in array (case when x?'voidDate' then array[false,true] else array[false] end) loop
    expected_id:='payroll-payment:'||(x->>'id')||case when is_void then ':void' else '' end;
    select value into e from jsonb_array_elements(new.payload->'entries') where value->>'id'=expected_id;
    if e is null or coalesce(e->'billDetails','null'::jsonb)<>'null'::jsonb or coalesce(e->'withholding','null'::jsonb)<>'null'::jsonb or coalesce(e->>'debtId','')<>'' or coalesce(e->>'to','')<>'' or e->>'payrollId' is distinct from p->>'id' or e->>'payrollPaymentId' is distinct from x->>'id' or e->>'amount' is distinct from x->>'amount' or e->>'account' is distinct from x->>'account' or e->>'date' is distinct from (case when is_void then x->>'voidDate' else x->>'date' end) or e->>'type' is distinct from (case when is_void then 'income' else 'expense' end) or e->>'category' is distinct from 'เงินเดือน' or coalesce((e->>'payrollReversal')::boolean,false)<>is_void or (not is_void and (e->'file' is distinct from x->'file' or e->>'recipientEmployeeId' is distinct from p->>'employeeId')) then raise exception 'PAYROLL_ENTRY_MISMATCH';end if;
    select value into prior_entry from jsonb_array_elements(coalesce(base->'entries','[]')) where value->>'id'=expected_id;
    if prior_entry is null and not coalesce((actor_access->>'owner')::boolean,false) and not coalesce('entries'=any(edit_rights),false) then raise exception 'PAYROLL_ENTRIES_FORBIDDEN';end if;
   end loop;
  end loop;
  if paid>net then raise exception 'PAYROLL_OVERPAYMENT';end if;
  if p->>'status'='cancelled' and (paid<>0 or coalesce(p->>'cancelDate','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p->>'cancelDate')::date,'YYYY-MM-DD')<>p->>'cancelDate' or p->>'cancelDate'<p->>'approvalDate' or length(trim(coalesce(p->>'cancelReason',''))) not between 1 and 500) then raise exception 'PAYROLL_CANCEL';end if;
 end loop;
 for prev in select value from jsonb_array_elements(coalesce(base->'payroll','[]')) where value->>'status'<>'draft' loop
  if not exists(select 1 from jsonb_array_elements(new.payload->'payroll') record_pl where record_pl->>'id'=prev->>'id') then raise exception 'PAYROLL_DELETE_APPROVED';end if;
 end loop;
 for prior_entry in select value from jsonb_array_elements(coalesce(base->'entries','[]')) where value?'payrollId' loop
  if not exists(select 1 from jsonb_array_elements(new.payload->'entries') saved_entry where saved_entry=prior_entry) then raise exception 'PAYROLL_ENTRY_IMMUTABLE';end if;
 end loop;
 for e in select value from jsonb_array_elements(new.payload->'entries') where value?'payrollId' loop
  if not exists(select 1 from jsonb_array_elements(new.payload->'payroll') record_pl cross join lateral jsonb_array_elements(record_pl->'payments') record_payment where record_pl->>'id'=e->>'payrollId' and e->>'id'='payroll-payment:'||(record_payment->>'id')||case when coalesce((e->>'payrollReversal')::boolean,false) then ':void' else '' end and (not coalesce((e->>'payrollReversal')::boolean,false) or record_payment?'voidDate')) then raise exception 'PAYROLL_ORPHAN_ENTRY';end if;
 end loop;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION billflow_private.validate_recurring()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb; d date;
begin
 
 if new.payload?'recurringExpenseNames' and new.payload->'recurringExpenseNames'<>'null'::jsonb then
  if jsonb_typeof(new.payload->'recurringExpenseNames') is distinct from 'array' or jsonb_array_length(new.payload->'recurringExpenseNames')>200 then raise exception 'INVALID_RECURRING_NAMES';end if;
  for r in select value from jsonb_array_elements(new.payload->'recurringExpenseNames') loop
   if jsonb_typeof(r->'id') is distinct from 'string' or length(r->>'id') not between 1 and 100 or jsonb_typeof(r->'name') is distinct from 'string' or length(trim(r->>'name')) not between 1 and 150 then raise exception 'INVALID_RECURRING_NAMES';end if;
  end loop;
  if (select count(distinct x->>'id') from jsonb_array_elements(new.payload->'recurringExpenseNames') x)<>jsonb_array_length(new.payload->'recurringExpenseNames') or (select count(distinct lower(trim(x->>'name'))) from jsonb_array_elements(new.payload->'recurringExpenseNames') x)<>jsonb_array_length(new.payload->'recurringExpenseNames') then raise exception 'INVALID_RECURRING_NAMES';end if;
 end if;
 if not(new.payload?'recurringExpenses') then return new;end if;
 if jsonb_typeof(new.payload->'recurringExpenses') is distinct from 'array' or jsonb_array_length(new.payload->'recurringExpenses')>500 then raise exception 'INVALID_RECURRING';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(new.payload->'recurringExpenses') x)<>jsonb_array_length(new.payload->'recurringExpenses') then raise exception 'DUPLICATE_RECURRING';end if;
 for r in select value from jsonb_array_elements(new.payload->'recurringExpenses') loop if r?'repeat' and jsonb_typeof(r->'repeat') is distinct from 'boolean' then raise exception 'INVALID_REPEAT';end if;
  if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'id') is distinct from 'string' or length(r->>'id') not between 1 and 100
   or jsonb_typeof(r->'title') is distinct from 'string' or length(trim(r->>'title')) not between 1 and 150
   or coalesce(r->>'frequency','') not in ('monthly','yearly') or coalesce(r->>'startDate','') !~ '^\d{4}-\d{2}-\d{2}$'
   or jsonb_typeof(r->'amount') is distinct from 'number' or coalesce(r->>'amount','') !~ '^[0-9]+$' or (r->>'amount')::numeric>100000000000000
   or jsonb_typeof(r->'enabled') is distinct from 'boolean' or jsonb_typeof(r->'note') is distinct from 'string' or length(r->>'note')>500
   or jsonb_typeof(r->'remindDays') is distinct from 'array' then raise exception 'INVALID_RECURRING';end if;
  d:=(r->>'startDate')::date;
  if d<'2000-01-01'::date or d>'2100-12-31'::date or to_char(d,'YYYY-MM-DD')<>r->>'startDate' then raise exception 'INVALID_RECURRING_DATE';end if;
  if r?'paidThrough' and (coalesce(r->>'paidThrough','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((r->>'paidThrough')::date,'YYYY-MM-DD')<>r->>'paidThrough') then raise exception 'INVALID_PAID_DATE';end if;
  if jsonb_array_length(r->'remindDays') not between 1 and 4 or exists(select 1 from jsonb_array_elements(r->'remindDays') x where x not in ('3'::jsonb,'7'::jsonb,'15'::jsonb,'30'::jsonb)) or (select count(distinct x) from jsonb_array_elements(r->'remindDays') x)<>jsonb_array_length(r->'remindDays') then raise exception 'INVALID_REMINDER_DAYS';end if;
 end loop;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION billflow_private.validate_withholding()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare e jsonb; w jsonb; prior jsonb; result jsonb:='[]'::jsonb; gross numeric; base numeric; rate numeric; amount numeric; k text;
begin
 for e in select value from jsonb_array_elements(new.payload->'entries') loop
  if tg_op='UPDATE' and not(e?'withholding') then
   select value->'withholding' into prior from jsonb_array_elements(old.payload->'entries') where value->>'id'=e->>'id';
   if prior is not null then e:=jsonb_set(e,'{withholding}',prior);end if;
  end if;
  w:=e->'withholding';
  if w is not null and w<>'null'::jsonb then
   if jsonb_typeof(w) is distinct from 'object' or e->>'type' not in ('income','expense') then raise exception 'WHT_INVALID_TYPE';end if;
   if jsonb_typeof(w->'rate') is distinct from 'number' or jsonb_typeof(w->'base') is distinct from 'number' or jsonb_typeof(w->'amount') is distinct from 'number' or jsonb_typeof(w->'manual') is distinct from 'boolean' then raise exception 'WHT_INVALID_AMOUNT';end if;
   gross:=(e->>'amount')::numeric;rate:=(w->>'rate')::numeric;base:=(w->>'base')::numeric;amount:=(w->>'amount')::numeric;
   if rate<=0 or rate>100 or rate*100<>round(rate*100) or base<=0 or base>gross or base<>trunc(base) or amount<0 or amount>gross or amount<>trunc(amount) then raise exception 'WHT_INVALID_AMOUNT';end if;
   if w->>'manual'='false' and amount<>round(base*rate/100) then raise exception 'WHT_CALCULATION_MISMATCH';end if;
   foreach k in array array['certificateNo','certificateDate','payerTaxId','payeeTaxId','form','note'] loop
    if jsonb_typeof(w->k) is distinct from 'string' or length(w->>k)>(case when k='note' then 500 else 100 end) then raise exception 'WHT_INVALID_DETAIL';end if;
   end loop;
   if w->>'manual'='true' and length(trim(w->>'note'))=0 then raise exception 'WHT_REASON_REQUIRED';end if;
   if w->>'form' not in ('','pnd3','pnd53','other') or (w->>'payerTaxId'<>'' and w->>'payerTaxId'!~'^\d{13}$') or (w->>'payeeTaxId'<>'' and w->>'payeeTaxId'!~'^\d{13}$') then raise exception 'WHT_INVALID_DETAIL';end if;
   if w->>'certificateDate'<>'' and (w->>'certificateDate'!~'^\d{4}-\d{2}-\d{2}$' or to_char((w->>'certificateDate')::date,'YYYY-MM-DD')<>w->>'certificateDate') then raise exception 'WHT_INVALID_DATE';end if;
  end if;
  result:=result||jsonb_build_array(e);
 end loop;
 new.payload:=jsonb_set(new.payload,'{entries}',result);
 return new;
end $function$
;
