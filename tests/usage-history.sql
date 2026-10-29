begin;
do $$
declare boss uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); device uuid:=gen_random_uuid(); c jsonb; p jsonb; rev bigint; e billflow_private.usage_events; total bigint;
begin
 select count(*) into total from billflow_private.usage_events;
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(boss,'audit-owner@example.invalid',now(),'{"name":"QA owner name"}'),(staff,'audit-staff@example.invalid',now(),'{"name":"QA staff"}');
 insert into auth.sessions(id,user_id,created_at,updated_at,ip) values(sid,boss,now(),now(),'192.0.2.42');
 update billflow_private.workspace set owner=boss where id=1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',boss,'session_id',sid,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-client-info','PUROnGBillFlow/1 device='||device,'user-agent','QA browser agent','x-forwarded-for','203.0.113.99')::text,true);
 set local role authenticated;
 perform public.billflow_log_usage('login','caller text must be ignored');
 perform public.billflow_log_usage('view','settings');
 begin perform public.billflow_log_usage('forged.action','');raise exception 'INVALID_ACTION_ACCEPTED';exception when others then if sqlerrm<>'INVALID_EVENT' then raise;end if;end;
 p:=(public.billflow_access_context())->'payload';p:=jsonb_set(p,'{entries}','[{"id":"audit-entry","type":"income","date":"2026-10-29","title":"Private financial title not copied","amount":12345,"account":"cash","category":"อื่น ๆ","contact":"","note":""}]');
 rev:=public.billflow_save_workspace(p,0);
 p:=jsonb_set(p,'{entries,0,amount}','54321');rev:=public.billflow_save_workspace(p,rev);
 c:=public.billflow_usage_history();if jsonb_array_length(c->'events')<4 or c->>'recordingStartedAt' is null then raise exception 'EVENTS_MISSING';end if;
 begin update billflow_private.usage_events set description='forged';raise exception 'CLIENT_EDIT_ALLOWED';exception when insufficient_privilege then null;end;
 begin delete from billflow_private.usage_events;raise exception 'CLIENT_DELETE_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform billflow_private.record_usage('forged','','','forged',staff);raise exception 'CLIENT_FORGED_ACTOR';exception when insufficient_privilege then null;end;
 reset role;
 select * into e from billflow_private.usage_events where actor_id=boss and action='update' and entity_id='audit-entry' order by id desc limit 1;
 if e.id is null or e.actor_name<>'QA owner name' or e.actor_email<>'audit-owner@example.invalid' or e.ip<>'192.0.2.42'::inet or e.ip_source<>'auth_session' or e.device_id<>device or e.user_agent<>'QA browser agent' or e.source<>'database' or not(e.details->'fields'?'amount') then raise exception 'BAD_EVENT_METADATA';end if;
 if e.details ? 'amount' or e.details::text like '%Private financial%' then raise exception 'FINANCIAL_VALUES_LEAKED';end if;
 -- No credential or arbitrary context values may be stored.
 set local role authenticated;perform public.billflow_log_usage('line.action','SYNTHETIC_API_SECRET_NOT_TO_LOG');reset role;
 if exists(select 1 from billflow_private.usage_events where actor_id=boss and (description||details::text) like '%SYNTHETIC_API_SECRET_NOT_TO_LOG%') then raise exception 'SECRET_LEAKED';end if;
 -- Clearing the financial payload must preserve all existing usage events.
 set local role authenticated;p:=jsonb_set(p,'{entries}','[]');perform public.billflow_save_workspace(p,rev);reset role;
 if not exists(select 1 from billflow_private.usage_events where id=e.id) then raise exception 'HISTORY_ERASED_WITH_DATA';end if;
 insert into public.billflow_members(user_id,display_name,menus,edit_menus) values(staff,'QA staff','{}','{}');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'role','authenticated')::text,true);set local role authenticated;
 begin perform public.billflow_usage_history();raise exception 'STAFF_READ_HISTORY';exception when others then if sqlerrm<>'OWNER_ONLY' then raise;end if;end;
 begin perform public.billflow_log_usage('view','settings');raise exception 'STAFF_FORGED_MENU';exception when others then if sqlerrm<>'MENU_FORBIDDEN' then raise;end if;end;
 reset role;
 if (select count(*) from billflow_private.usage_events)<=total then raise exception 'TRIGGERS_NOT_FIRED';end if;
end $$;
rollback;
select 'Usage audit: metadata, session IP, device, permissions, redaction and retention passed; fixtures rolled back' as result;
