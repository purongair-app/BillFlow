begin;
do $test$
declare who uuid; p jsonb; rev bigint; doc uuid:=gen_random_uuid(); fileid uuid:=gen_random_uuid(); slip jsonb; good jsonb; rejected boolean;
begin
 select owner into who from billflow_private.workspace where id=1;perform set_config('request.jwt.claim.sub',who::text,true);
 select payload,revision into p,rev from public.billflow_ledgers where owner=who;
 insert into public.billflow_line_inbox(id,owner,message_id,group_id,file_id,mime,file_size,status,extracted) values(doc,who,'qa-payroll-'||doc::text,'qa-rollback',fileid,'image/png',100,'ready','{"documentType":"payroll"}');
 p:=jsonb_set(p,'{employees}',coalesce(p->'employees','[]')||'[{"id":"qa-payroll-form","code":"QAPF","name":"QA payroll form","position":"Test","active":true}]');
 slip:=jsonb_build_object('id',doc,'sourceDocumentId',doc,'file',jsonb_build_object('id',fileid,'name','qa.png','mime','image/png','size',100),'employeeId','qa-payroll-form','employeeCode','QAPF','employeeName','QA payroll form','position','Test','periodStart','2099-04-01','periodEnd','2099-04-15','dueDate','2099-04-30','basis','daily','units',12,'rate',30000,'earnings','[]'::jsonb,'deductions','[{"name":"social","kind":"social","amount":35000},{"name":"late","kind":"unpaid","quantity":3,"unitRate":1900,"amount":5700}]'::jsonb,'employerSocial',0,'note','','status','draft','payments','[]'::jsonb,'form','{"documentNo":"QA-PAYFORM-2099","department":"Test","issueDate":"2099-04-29","monthlySalary":900000,"restDays":2,"leaveDays":0,"absenceDays":1,"workedDays":12,"managerName":"QA","managerPosition":"Manager","guaranteeAmount":1000000,"footer":"QA"}'::jsonb);
 p:=jsonb_set(p,'{payroll}',coalesce(p->'payroll','[]')||jsonb_build_array(slip));good:=p;
 rejected:=false;begin
  perform public.billflow_confirm_inbox(doc,'payroll',jsonb_set(p,array['payroll',(jsonb_array_length(p->'payroll')-1)::text,'form','workedDays'],'15'),rev);
 exception when others then if sqlerrm<>'PAYROLL_FORM_DAYS' then raise;end if;rejected:=true;end;if not rejected then raise exception 'QA_BAD_DAYS_ACCEPTED';end if;
 rejected:=false;begin
  perform public.billflow_confirm_inbox(doc,'payroll',jsonb_set(p,array['payroll',(jsonb_array_length(p->'payroll')-1)::text,'deductions','1','amount'],'57'),rev);
 exception when others then if sqlerrm<>'PAYROLL_LINE_CALCULATION' then raise;end if;rejected:=true;end;if not rejected then raise exception 'QA_BAD_FORMULA_ACCEPTED';end if;
 rev:=public.billflow_confirm_inbox(doc,'payroll',good,rev);
 if not exists(select 1 from public.billflow_line_inbox where id=doc and status='confirmed' and confirmed_target='payroll') then raise exception 'QA_CONFIRM_FAILED';end if;
 rejected:=false;begin perform public.billflow_confirm_inbox(doc,'payroll',good,rev);exception when others then if sqlerrm<>'DRAFT_NOT_AVAILABLE' then raise;end if;rejected:=true;end;if not rejected then raise exception 'QA_DUPLICATE_ACCEPTED';end if;
end $test$;
select 'payroll_document_validation_and_LINE_draft_import_passed' as result;
rollback;
