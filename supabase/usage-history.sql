begin;
create table billflow_private.usage_events(
 id bigint generated always as identity primary key,occurred_at timestamptz not null default clock_timestamp(),
 actor_id uuid,actor_name text not null,actor_email text not null default '',subject_owner uuid,
 action text not null,entity_type text not null default '',entity_id text not null default '',description text not null,
 source text not null check(source in ('database','browser','system')),session_id uuid,ip inet,ip_source text not null default '',device_id uuid,user_agent text not null default '',details jsonb not null default '{}'
);
create index on billflow_private.usage_events(occurred_at desc,id desc);
create index on billflow_private.usage_events(actor_id,id desc);
revoke all on billflow_private.usage_events from public,anon,authenticated;

create function billflow_private.record_usage(p_action text,p_entity text,p_id text,p_description text,p_owner uuid,p_source text default 'database',p_details jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); sid uuid; ipaddr inet; device uuid; h jsonb:='{}'; client_info text; mail text:=''; person text:='ระบบ / LINE'; profile jsonb;
begin
 begin h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;exception when others then h:='{}';end;
 begin sid:=(auth.jwt()->>'session_id')::uuid;exception when others then sid:=null;end;
 if who is not null then
  select u.email,coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),u.email) into mail,person from auth.users u where u.id=who;
  profile:=billflow_private.my_profile();person:=coalesce(nullif(profile->>'name',''),person,mail,'ผู้ใช้งาน');
  select s.ip into ipaddr from auth.sessions s where s.id=sid and s.user_id=who;
 end if;
 client_info:=coalesce(h->>'x-client-info','');
 begin device:=(substring(client_info from 'device=([0-9a-fA-F-]{36})'))::uuid;exception when others then device:=null;end;
 insert into billflow_private.usage_events(actor_id,actor_name,actor_email,subject_owner,action,entity_type,entity_id,description,source,session_id,ip,ip_source,device_id,user_agent,details)
 values(who,left(coalesce(person,'ระบบ'),150),left(coalesce(mail,''),254),p_owner,left(p_action,80),left(p_entity,80),left(coalesce(p_id,''),150),left(p_description,500),case when who is null then 'system' else p_source end,sid,ipaddr,case when ipaddr is null then '' else 'auth_session' end,device,left(coalesce(h->>'user-agent',''),1000),p_details);
end $$;

create function billflow_private.ledger_usage() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; label text; before jsonb; after jsonb; x jsonb; y jsonb; verb text; operation text; changed_fields jsonb; count_rows int:=0; baseline jsonb:='{}';
begin
 if tg_op='UPDATE' then baseline:=old.payload;end if;
 foreach k in array array['entries','debts','accounts','contacts','employees','budgets','documentSources','recurringExpenses','recurringExpenseNames'] loop
  before:=coalesce(baseline->k,'[]');after:=coalesce(new.payload->k,'[]');
  if before='null'::jsonb then before:='[]';end if;if after='null'::jsonb then after:='[]';end if;
  if before=after then continue;end if;
  label:=case k when 'entries' then 'รายการรับ–จ่าย' when 'debts' then 'ลูกหนี้ / เจ้าหนี้' when 'accounts' then 'บัญชีเงิน' when 'contacts' then 'รายชื่อผู้ติดต่อ' when 'employees' then 'รายชื่อพนักงาน' when 'budgets' then 'งบประมาณ' when 'documentSources' then 'ระบบเอกสารต้นทาง' when 'recurringExpenses' then 'รายจ่ายประจำ' else 'ชื่อรายจ่าย' end;
  for x,y in select n.value,o.value from jsonb_array_elements(after) n full join jsonb_array_elements(before) o on n.value->>'id'=o.value->>'id' where n.value is distinct from o.value loop
   count_rows:=count_rows+1;if count_rows>200 then exit;end if;
   operation:=case when y is null then 'create' when x is null then 'delete' else 'update' end;verb:=case operation when 'create' then 'เพิ่ม' when 'delete' then 'ลบ' else 'แก้ไข' end;
   select coalesce(jsonb_agg(field order by field),'[]') into changed_fields from (select key field from jsonb_each(coalesce(x,'{}')) union select key from jsonb_each(coalesce(y,'{}'))) keys where x->field is distinct from y->field;
   -- Metadata only: no financial values, contact details, photos, credentials or full payload snapshots.
   perform billflow_private.record_usage(operation,k,coalesce(x->>'id',y->>'id'),verb||label,new.owner,'database',jsonb_build_object('revision',new.revision,'fields',changed_fields));
  end loop;
  if count_rows>200 then exit;end if;
 end loop;
 if count_rows>200 then perform billflow_private.record_usage('bulk','ledger',new.owner::text,'บันทึกข้อมูลจำนวนมาก (แสดงรายละเอียดสูงสุด 200 รายการต่อครั้ง)',new.owner,'database',jsonb_build_object('revision',new.revision));end if;
 if baseline->'bookkeeping' is distinct from new.payload->'bookkeeping' then perform billflow_private.record_usage('update','bookkeeping',new.owner::text,'บันทึกระบบบัญชีและสมุดรายวัน',new.owner,'database',jsonb_build_object('revision',new.revision));end if;
 if baseline->'business' is distinct from new.payload->'business' or baseline->'categories' is distinct from new.payload->'categories' or baseline->'accountHolders' is distinct from new.payload->'accountHolders' then perform billflow_private.record_usage('update','settings',new.owner::text,'แก้ไขข้อมูลกิจการ / หมวดหมู่ / ชื่อบัญชี',new.owner,'database',jsonb_build_object('revision',new.revision));end if;
 return new;
end $$;
create trigger billflow_usage_ledger after insert or update on public.billflow_ledgers for each row execute function billflow_private.ledger_usage();

create function billflow_private.settings_usage() returns trigger language plpgsql security definer set search_path='' as $$
declare current jsonb:=to_jsonb(new); previous jsonb:='{}'; label text; subject uuid; row_id text;
begin
 if tg_op='UPDATE' then previous:=to_jsonb(old);end if;
 if current=previous then return new;end if;
 if tg_table_name='billflow_line_settings' and current-array['webhook_seen_at','updated_at']=previous-array['webhook_seen_at','updated_at'] then return new;end if;
 if tg_table_name='reset_challenges' and (current->>'used_at' is null or previous->>'used_at' is not null) then return new;end if;
 label:=case tg_table_name when 'billflow_members' then 'กำหนดสิทธิ์ผู้ใช้งาน' when 'billflow_line_settings' then 'แก้ไขการเชื่อมต่อ / ตั้งค่า LINE' when 'ocr_settings' then 'แก้ไขการตั้งค่า Google Gemini' when 'reset_challenges' then 'ยืนยันล้างข้อมูลการเงินทั้งหมดสำเร็จ' else 'ปรับสถานะเอกสารจาก LINE' end;
 subject:=nullif(current->>'owner','')::uuid;row_id:=coalesce(current->>'user_id',current->>'id',current->>'owner');
 perform billflow_private.record_usage(case when tg_table_name='reset_challenges' then 'reset' else 'update' end,tg_table_name,row_id,label,subject,'database');return new;
end $$;
create trigger billflow_usage_members after insert or update on public.billflow_members for each row execute function billflow_private.settings_usage();
create trigger billflow_usage_line after insert or update on public.billflow_line_settings for each row execute function billflow_private.settings_usage();
create trigger billflow_usage_ocr after insert or update on billflow_private.ocr_settings for each row execute function billflow_private.settings_usage();
create trigger billflow_usage_reset after update on billflow_private.reset_challenges for each row execute function billflow_private.settings_usage();

create function billflow_private.client_usage(p_action text,p_context text default '') returns void language plpgsql security definer set search_path='' as $$
declare ctx jsonb; label text; section text;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED';end if;
 if p_action not in ('login','logout','view','export','attachment.read','attachment.upload','line.action','reset.code_request','account.email.request','account.updated') then raise exception 'INVALID_EVENT';end if;
 ctx:=billflow_private.access_context()->'access';
 if p_action in ('line.action','reset.code_request','account.email.request') and ctx->>'owner'<>'true' then raise exception 'OWNER_ONLY';end if;
 if p_action='view' then
  if not coalesce((ctx->>'owner')::boolean,false) and not((ctx->'menus')?p_context) then raise exception 'MENU_FORBIDDEN';end if;
  section:=case p_context when 'overview' then 'ภาพรวม' when 'entries' then 'รายการรับ–จ่าย' when 'cashbook' then 'สมุดบัญชี' when 'accounts' then 'บัญชีเงิน' when 'people' then 'รายชื่อผู้ติดต่อ' when 'debts' then 'ลูกหนี้ / เจ้าหนี้' when 'budgets' then 'รายจ่ายประจำ' when 'reports' then 'รายงาน' when 'inbox' then 'เอกสารจาก LINE' when 'line' then 'แจ้งเตือน LINE' when 'permissions' then 'สิทธิ์ผู้ใช้งาน' when 'settings' then 'ตั้งค่า' end;
  if section is null then raise exception 'INVALID_MENU';end if;
 end if;
 -- Context is enumerated; never accept caller-supplied free text or secrets.
 label:=case p_action when 'login' then 'เข้าสู่ระบบสำเร็จ (เบราว์เซอร์แจ้ง)' when 'logout' then 'ร้องขอออกจากระบบ' when 'view' then 'เปิดเมนู '||section when 'export' then 'ส่งออก / สำรองข้อมูล' when 'attachment.read' then 'ร้องขอเปิดเอกสารแนบ' when 'attachment.upload' then 'แนบเอกสาร' when 'line.action' then 'เรียกใช้งานการตั้งค่า / เอกสาร LINE' when 'reset.code_request' then 'ขอรหัสอีเมลยืนยันการล้างข้อมูล' when 'account.email.request' then 'ขอเปลี่ยนอีเมลเจ้าของบัญชี' else 'อัปเดตข้อมูลบัญชีเข้าสู่ระบบ' end;
 -- Bound browser-only view events; database change events are never sampled.
 if exists(select 1 from billflow_private.usage_events where actor_id=auth.uid() and source='browser' and occurred_at>now()-interval '1 minute' group by actor_id having count(*)>=120) then return;end if;
 perform billflow_private.record_usage(p_action,case when p_action='view' then p_context else '' end,'',label,auth.uid(),'browser');
end $$;
create function public.billflow_log_usage(p_action text,p_context text default '') returns void language sql security invoker set search_path='' as $$select billflow_private.client_usage(p_action,p_context);$$;

create function billflow_private.usage_history(p_before bigint default null,p_from date default null,p_to date default null,p_search text default '',p_action text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb; cursor bigint;
begin
 if auth.uid() is null or not exists(select 1 from billflow_private.workspace where owner=auth.uid()) then raise exception 'OWNER_ONLY';end if;
 if length(coalesce(p_search,''))>150 then raise exception 'INVALID_SEARCH';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.number desc),'[]'),min(q.number) into rows,cursor from (
 select e.id number,e.id::text id,e.occurred_at,e.actor_name,e.actor_email,e.actor_id,e.action,e.entity_type,e.entity_id,e.description,e.source,host(e.ip) ip,e.ip_source,e.device_id,e.user_agent,e.details
 from billflow_private.usage_events e where (p_before is null or e.id<p_before) and (p_from is null or e.occurred_at >= (p_from::timestamp at time zone 'Asia/Bangkok')) and (p_to is null or e.occurred_at < ((p_to+1)::timestamp at time zone 'Asia/Bangkok'))
 and (coalesce(p_search,'')='' or position(lower(p_search) in lower(e.actor_name||' '||e.actor_email||' '||e.description||' '||coalesce(e.ip::text,'')||' '||coalesce(e.device_id::text,'')||' '||e.entity_id))>0)
 and (coalesce(p_action,'')='' or e.action=p_action) order by e.id desc limit 100) q;
 return jsonb_build_object('events',rows,'nextBefore',cursor::text,'hasMore',jsonb_array_length(rows)=100);
end $$;
create function public.billflow_usage_history(p_before bigint default null,p_from date default null,p_to date default null,p_search text default '',p_action text default '') returns jsonb language sql security invoker set search_path='' as $$select billflow_private.usage_history(p_before,p_from,p_to,p_search,p_action);$$;
revoke all on function billflow_private.record_usage(text,text,text,text,uuid,text,jsonb),billflow_private.ledger_usage(),billflow_private.settings_usage(),billflow_private.client_usage(text,text),public.billflow_log_usage(text,text),billflow_private.usage_history(bigint,date,date,text,text),public.billflow_usage_history(bigint,date,date,text,text) from public,anon,authenticated;
grant execute on function billflow_private.client_usage(text,text),public.billflow_log_usage(text,text),billflow_private.usage_history(bigint,date,date,text,text),public.billflow_usage_history(bigint,date,date,text,text) to authenticated;
commit;
