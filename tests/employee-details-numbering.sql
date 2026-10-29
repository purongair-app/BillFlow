begin;
do $$declare who uuid; p jsonb; rev bigint; n jsonb; denied boolean; last_employee integer;begin
 select owner into who from billflow_private.workspace where id=1;perform set_config('request.jwt.claim.sub',who::text,true);
 select payload,revision into p,rev from public.billflow_ledgers where owner=who;
 p:=jsonb_set(p,'{employees}',coalesce(p->'employees','[]')||'[{"id":"employee-detail-qa","code":"QA-CONTACT","name":"QA","position":"Test","active":true,"address":"12 Test","phone":"081-234-5678","bankName":"QA Bank","bankAccountName":"QA","bankAccountNumber":"0012345678"}]');last_employee:=jsonb_array_length(p->'employees')-1;
 p:=jsonb_set(p,'{numbering}','{"employee":{"prefix":"STAFF","year":"none","month":false,"prefixSeparator":"","sequenceSeparator":"","digits":4,"start":20}}');
 rev:=public.billflow_save_workspace(p,rev);
 n:=jsonb_set(p,array['employees',last_employee::text,'code'],'"QA-CHANGED"');n:=jsonb_set(n,array['employees',last_employee::text],(n->'employees'->last_employee)-'address'-'phone'-'bankName'-'bankAccountName'-'bankAccountNumber');
 rev:=public.billflow_save_workspace(n-'numbering',rev);
 select payload into n from public.billflow_ledgers where owner=who;
 if n->'employees'->last_employee->>'bankAccountNumber'<>'0012345678' or n->'employees'->last_employee->>'code'<>'QA-CHANGED' or n->'numbering'->'employee'->>'prefix'<>'STAFF' then raise exception 'LEGACY_DATA_LOSS';end if;
 denied:=false;begin perform public.billflow_save_workspace(jsonb_set(n,array['employees',last_employee::text,'phone'],'"invalid"'),rev);exception when others then if sqlerrm='EMPLOYEE_PHONE_INVALID' then denied:=true;else raise;end if;end;if not denied then raise exception 'INVALID_PHONE_ACCEPTED';end if;
 denied:=false;begin perform public.billflow_save_workspace(jsonb_set(n,array['numbering','employee','digits'],'0'),rev);exception when others then if sqlerrm='NUMBERING_INVALID' then denied:=true;else raise;end if;end;if not denied then raise exception 'INVALID_NUMBERING_ACCEPTED';end if;
 if billflow_private.project_payload(n,array['people'])->'numbering' is distinct from n->'numbering' then raise exception 'NUMBERING_NOT_PROJECTED';end if;
end $$;
create temporary table numbering_permission_qa(payload jsonb) on commit drop;
create trigger numbering_permission_qa before insert on numbering_permission_qa for each row execute function billflow_private.validate_employee_details_numbering();
do $$declare worker uuid; denied boolean:=false;begin
 select id into worker from auth.users where id<>(select owner from billflow_private.workspace where id=1) limit 1;
 if worker is null then raise exception 'NO_NONOWNER_ACCOUNT_FOR_TEST';end if;
 perform set_config('request.jwt.claim.sub',worker::text,true);
 begin insert into numbering_permission_qa values('{"numbering":{"employee":{"prefix":"STAFF","year":"none","month":false,"prefixSeparator":"","sequenceSeparator":"","digits":4,"start":20}}}');exception when others then if sqlerrm='NUMBERING_OWNER_ONLY' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'NONOWNER_NUMBERING_WRITE_ACCEPTED';end if;
end $$;
select 'employee_details_numbering_and_old_browser_preservation_passed' as result;
rollback;
