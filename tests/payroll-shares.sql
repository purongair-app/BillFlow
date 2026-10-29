begin;
do $$declare who uuid; request_id uuid:=gen_random_uuid();begin
 select owner into who from billflow_private.workspace where id=1;
 if has_table_privilege('authenticated','public.billflow_payroll_shares','SELECT') or has_table_privilege('anon','public.billflow_payroll_shares','INSERT') then raise exception 'SHARE_TABLE_EXPOSED';end if;
 insert into public.billflow_payroll_shares(id,owner,payroll_id,file_id,kind,document_copy,group_id,status) values(request_id,who,'qa-payroll',gen_random_uuid(),'payslip','employee','qa-no-send','pending');
 update public.billflow_payroll_shares set status='sent',sent_at=now(),expires_at=now()+interval '24 hours' where id=request_id;
 if not exists(select 1 from billflow_private.usage_events where entity_type='payroll' and entity_id='qa-payroll' and action='line.payroll.share' and details->>'shareId'=request_id::text) then raise exception 'SHARE_AUDIT_MISSING';end if;
end $$;
select 'payroll_share_access_and_audit_passed_no_message_sent' as result;
rollback;
