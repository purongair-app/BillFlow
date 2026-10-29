begin;
select set_config('request.jwt.claim.sub',(select owner::text from billflow_private.workspace where id=1),true);
set local role authenticated;
do $test$
declare who uuid; payload jsonb; rev bigint; slip jsonb; payment jsonb; entry jsonb; result bigint; caught boolean; original jsonb;
begin
 who:=auth.uid();
 perform set_config('request.jwt.claim.sub',who::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',who,'role','authenticated')::text,true);
 select l.payload,l.revision into payload,rev from public.billflow_ledgers l where l.owner=who;
 if payload is null then raise exception 'TEST_REQUIRES_OWNER_LEDGER';end if;
 original:=payload;
 payload:=jsonb_set(payload,'{employees}',coalesce(payload->'employees','[]')||jsonb_build_array(jsonb_build_object('id','payroll-test-emp','code','PAYROLLTEST','name','Payroll Test','position','Test','active',true)));
 slip:='{"id":"payroll-test-slip","employeeId":"payroll-test-emp","employeeCode":"PAYROLLTEST","employeeName":"Payroll Test","position":"Test","periodStart":"2099-01-01","periodEnd":"2099-01-31","dueDate":"2099-01-31","basis":"monthly","units":1,"rate":2000000,"earnings":[{"name":"OT","amount":300000}],"deductions":[{"name":"Tax","kind":"tax","amount":100000},{"name":"Social","kind":"social","amount":75000}],"employerSocial":75000,"note":"","status":"draft","payments":[]}'::jsonb;
 payload:=jsonb_set(payload,'{payroll}',coalesce(payload->'payroll','[]')||jsonb_build_array(slip));
 result:=public.billflow_save_workspace(payload,rev);rev:=result;
 slip:=slip||'{"status":"approved","approvalDate":"2099-01-31","approvedAt":"2099-01-31T10:00:00Z"}'::jsonb;
 payload:=jsonb_set(payload,'{payroll}',(select jsonb_agg(case when v->>'id'='payroll-test-slip' then slip else v end) from jsonb_array_elements(payload->'payroll') v));
 result:=public.billflow_save_workspace(payload,rev);rev:=result;
 payment:=jsonb_build_object('id','payroll-test-payment','amount',500000,'date','2099-01-31','account',payload->'accounts'->0->>'id','method','bank','reference','Test1','note','');
 slip:=jsonb_set(slip,'{payments}',jsonb_build_array(payment));
 entry:=jsonb_build_object('id','payroll-payment:payroll-test-payment','payrollId','payroll-test-slip','payrollPaymentId','payroll-test-payment','payrollReversal',false,'type','expense','amount',500000,'date','2099-01-31','account',payment->>'account','category','เงินเดือน','title','Test payroll payment','contact','Payroll Test','note','','recipientEmployeeId','payroll-test-emp','recipient','Payroll Test');
 payload:=jsonb_set(payload,'{payroll}',(select jsonb_agg(case when v->>'id'='payroll-test-slip' then slip else v end) from jsonb_array_elements(payload->'payroll') v));
 payload:=jsonb_set(payload,'{entries}',(payload->'entries')||jsonb_build_array(entry));
 result:=public.billflow_save_workspace(payload,rev);rev:=result;
 -- An unrelated old browser save must retain the payroll collection.
 result:=public.billflow_save_workspace(payload-'payroll',rev);rev:=result;
 if not exists(select 1 from public.billflow_ledgers l where l.owner=who and l.payload->'payroll' @> jsonb_build_array(jsonb_build_object('id','payroll-test-slip'))) then raise exception 'PAYROLL_PRESERVATION_FAILED';end if;
 caught:=false;begin
  perform public.billflow_save_workspace(jsonb_set(payload,'{payroll}',(select jsonb_agg(case when v->>'id'='payroll-test-slip' then jsonb_set(v,'{rate}','1') else v end) from jsonb_array_elements(payload->'payroll') v)),rev);
 exception when others then if sqlerrm not like 'PAYROLL_%' then raise;end if;caught:=true;end;if not caught then raise exception 'IMMUTABILITY_FAILED';end if;
 caught:=false;begin
  perform public.billflow_save_workspace(jsonb_set(payload,'{entries}',(select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(payload->'entries') v where v->>'id'<>'payroll-payment:payroll-test-payment')),rev);
 exception when others then if sqlerrm not like 'PAYROLL_%' then raise;end if;caught:=true;end;if not caught then raise exception 'PAYMENT_DELETE_FAILED';end if;
 -- Refund has a separate cash receipt and keeps the original expense.
 payment:=payment||'{"voidDate":"2099-02-01","voidReason":"Test refund"}';
 slip:=jsonb_set(slip,'{payments}',jsonb_build_array(payment));
 entry:=entry||'{"id":"payroll-payment:payroll-test-payment:void","type":"income","date":"2099-02-01","payrollReversal":true}';
 payload:=jsonb_set(payload,'{payroll}',(select jsonb_agg(case when v->>'id'='payroll-test-slip' then slip else v end) from jsonb_array_elements(payload->'payroll') v));
 payload:=jsonb_set(payload,'{entries}',(payload->'entries')||jsonb_build_array(entry));
 result:=public.billflow_save_workspace(payload,rev);rev:=result;
 slip:=slip||'{"status":"cancelled","cancelDate":"2099-02-01","cancelReason":"Test cancel"}';
 payload:=jsonb_set(payload,'{payroll}',(select jsonb_agg(case when v->>'id'='payroll-test-slip' then slip else v end) from jsonb_array_elements(payload->'payroll') v));
 result:=public.billflow_save_workspace(payload,rev);
 raise notice 'PAYROLL_SQL_TESTS_PASSED';
end $test$;
rollback;
