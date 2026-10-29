begin;
do $$
declare boss uuid; r jsonb; n int; qid uuid; worker uuid; ctx jsonb; p jsonb; rev bigint;
begin
 select owner into boss from public.billflow_line_settings where enabled and group_id is not null limit 1;
 if boss is null then raise exception 'NO_PAIRED_GROUP';end if;
 r:='[{"id":"qa-monthly","title":"QA rent","frequency":"monthly","startDate":"2026-01-05","amount":800000,"remindDays":[7],"enabled":true,"note":""},{"id":"qa-yearly","title":"QA tax","frequency":"yearly","startDate":"2026-11-28","amount":0,"remindDays":[30],"enabled":true,"note":""}]';
 update public.billflow_ledgers set payload=jsonb_set(payload,'{recurringExpenses}',r) where owner=boss;
 n:=billflow_private.enqueue_recurring('2026-10-29 01:59:00+00');if n<>0 then raise exception 'SENT_BEFORE_9AM';end if;
 n:=billflow_private.enqueue_recurring('2026-10-29 02:00:00+00');if n<>2 then raise exception 'BAD_MONTHLY_YEARLY_COUNT:%',n;end if;
 n:=billflow_private.enqueue_recurring('2026-10-29 02:01:00+00');if n<>0 then raise exception 'DUPLICATE_NOTICE';end if;
 select id into qid from public.billflow_line_outbox where owner=boss and entry_id='recurring:qa-monthly:2026-11-05:7';
 update public.billflow_line_outbox set status='processing' where id=qid;
 if not public.billflow_recurring_notice_valid(qid) then raise exception 'ACTIVE_NOTICE_REJECTED';end if;
 update public.billflow_ledgers set payload=jsonb_set(payload,'{recurringExpenses,0,paidThrough}','"2026-11-05"') where owner=boss;
 if public.billflow_recurring_notice_valid(qid) then raise exception 'PAID_NOTICE_VALID';end if;
 perform billflow_private.enqueue_recurring('2026-10-29 02:02:00+00');
 if (select status from public.billflow_line_outbox where id=qid)<>'cancelled' then raise exception 'PAID_NOTICE_NOT_CANCELLED';end if;
 if not billflow_private.recurring_due('{"frequency":"monthly","startDate":"2026-01-31"}','2026-02-28') or billflow_private.recurring_due('{"frequency":"monthly","startDate":"2026-01-31"}','2026-03-28') then raise exception 'MONTH_END_DRIFT';end if;
 if not billflow_private.recurring_due('{"frequency":"yearly","startDate":"2024-02-29"}','2028-02-29') then raise exception 'LEAP_YEAR_BROKEN';end if;
 begin update public.billflow_ledgers set payload=jsonb_set(payload,'{recurringExpenses,0,remindDays}','[1]') where owner=boss;raise exception 'INVALID_DAYS_ACCEPTED';exception when others then if sqlerrm<>'INVALID_REMINDER_DAYS' then raise;end if;end;
 -- Menu permission applies to own recurring settings, without exposing the owner's ledger.
 select u.id into worker from auth.users u left join public.billflow_ledgers l on l.owner=u.id where u.id<>boss and l.owner is null limit 1;
 insert into public.billflow_members(user_id,display_name,menus,edit_menus) values(worker,'QA recurring',array['budgets'],array['budgets']);
 perform set_config('request.jwt.claim.sub',worker::text,true);set local role authenticated;
 ctx:=public.billflow_access_context();p:=jsonb_set(ctx->'payload','{recurringExpenses}',r);rev:=(ctx->>'revision')::bigint;
 perform public.billflow_save_workspace(p,rev);ctx:=public.billflow_access_context();if ctx->'payload'->'recurringExpenses'<>r then raise exception 'RECURRING_NOT_SAVED';end if;
 reset role;update public.billflow_members set edit_menus='{}' where user_id=worker;
 set local role authenticated;
 begin perform public.billflow_save_workspace(p,1);raise exception 'READONLY_ACCEPTED';exception when others then if sqlerrm<>'READ_ONLY' then raise;end if;end;
 reset role;
end $$;
rollback;
select 'recurring scheduling, deduplication, cancellation, validation, permissions: passed' as result;
