begin;
do $test$
declare boss uuid; worker uuid; worker_email text; ctx jsonb; payload jsonb; rev bigint; slip jsonb; payment jsonb; entry jsonb; caught boolean;
begin
 select owner into boss from billflow_private.workspace where id=1;
 select u.id,u.email into worker,worker_email from auth.users u left join public.billflow_members m on m.user_id=u.id left join public.billflow_ledgers l on l.owner=u.id where u.id<>boss and m.user_id is null and l.owner is null and u.email_confirmed_at is not null limit 1;
 if worker is null then raise exception 'NO_UNUSED_TEST_ACCOUNT';end if;
 perform set_config('request.jwt.claim.sub',boss::text,true);
 perform public.billflow_manage_members_v2('save',worker_email,'Payroll QA',array['payroll','entries','people'],array['payroll','entries','people'],true,'employee');
 perform set_config('request.jwt.claim.sub',worker::text,true);set local role authenticated;
 ctx:=public.billflow_access_context();payload:=ctx->'payload';rev:=(ctx->>'revision')::bigint;
 payload:=jsonb_set(payload,'{employees}','[{"id":"qa-emp","code":"QAPAY","name":"QA payroll","position":"Test","active":true}]');
 slip:='{"id":"qa-slip","employeeId":"qa-emp","employeeCode":"QAPAY","employeeName":"QA payroll","position":"Test","periodStart":"2099-03-01","periodEnd":"2099-03-31","dueDate":"2099-03-31","basis":"monthly","units":1,"rate":1000000,"earnings":[],"deductions":[],"employerSocial":0,"note":"","status":"draft","payments":[]}';
 payload:=jsonb_set(payload,'{payroll}',jsonb_build_array(slip));rev:=public.billflow_save_workspace(payload,rev);
 slip:=slip||'{"status":"approved","approvalDate":"2099-03-31","approvedAt":"2099-03-31T10:00:00Z"}';payload:=jsonb_set(payload,'{payroll}',jsonb_build_array(slip));rev:=public.billflow_save_workspace(payload,rev);
 payment:=jsonb_build_object('id','qa-pay','amount',500000,'date','2099-03-31','account',payload->'accounts'->0->>'id','method','cash','reference','','note','');
 slip:=jsonb_set(slip,'{payments}',jsonb_build_array(payment));payload:=jsonb_set(payload,'{payroll}',jsonb_build_array(slip));
 entry:=jsonb_build_object('id','payroll-payment:qa-pay','payrollId','qa-slip','payrollPaymentId','qa-pay','payrollReversal',false,'type','expense','amount',500000,'date','2099-03-31','account',payment->>'account','category','เงินเดือน','title','Test payroll payment','contact','QA payroll','note','','recipientEmployeeId','qa-emp','recipient','QA payroll');
 payload:=jsonb_set(payload,'{entries}',jsonb_build_array(entry));rev:=public.billflow_save_workspace(payload,rev);
 reset role;update public.billflow_members set edit_menus=array['entries'],menus=array['entries'] where user_id=worker;set local role authenticated;
 caught:=false;begin
  perform public.billflow_save_workspace(jsonb_set(payload,'{payroll,0,note}','"unauthorized"'),rev);
 exception when others then if sqlerrm not like 'MENU_FORBIDDEN:%' then raise;end if;caught:=true;end;
 if not caught then raise exception 'PAYROLL_PERMISSION_FAILED';end if;
 raise notice 'PAYROLL_MEMBER_PERMISSIONS_PASSED';
end $test$;
rollback;
