begin;
-- Reset gets a new ledger row, so normal UPDATE guards still protect approved
-- payroll/journals and preserve omitted fields for every ordinary save.
create or replace function billflow_private.reset_payload() returns jsonb
language sql security invoker set search_path='' as $$
 select billflow_private.default_payload() || '{"payroll":[],"numbering":{},"recurringExpenses":[],"recurringExpenseNames":[]}'::jsonb;
$$;
revoke all on function billflow_private.reset_payload() from public,anon,authenticated;

do $patch$
declare f text; signature text; guard text; old_block text; new_block text;
begin
 guard:=$guard$if exists(select 1 from public.billflow_ledgers where owner=who and payload->'bookkeeping' is not null and payload->'bookkeeping'<>'null'::jsonb) then raise exception 'ACCOUNTING_RESET_NOT_READY';end if;$guard$;
 foreach signature in array array['billflow_private.begin_reset()','billflow_private.confirm_reset(uuid,text,text)'] loop
  f:=pg_get_functiondef(to_regprocedure(signature));
  f:=replace(f,guard,'');
  if signature='billflow_private.confirm_reset(uuid,text,text)' and position('billflow_private.reset_payload()' in f)=0 then
   old_block:=$old$if rev is null then
  insert into public.billflow_ledgers(owner,payload,revision) values(who,billflow_private.default_payload(),1);rev:=1;
 else
  update public.billflow_ledgers set payload=billflow_private.default_payload(),revision=revision+1,updated_at=now() where owner=who returning revision into rev;
 end if;$old$;
   new_block:=$new$-- Reached only after the owner/session/OTP/phrase/revision checks above.
 delete from public.billflow_payroll_shares where owner=who;
 update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}')-'billflow_owner_photo_id' where id=who;
 delete from public.billflow_ledgers where owner=who;
 rev:=coalesce(rev,0)+1;
 insert into public.billflow_ledgers(owner,payload,revision) values(who,billflow_private.reset_payload(),rev);
 -- Retain central audit history and connection credentials; add a reset event.
 perform billflow_private.record_usage('reset','workspace','','เริ่มต้นข้อมูลร้านใหม่ทุกเมนู',who,'database',jsonb_build_object('revision',rev));$new$;
   if position(old_block in f)=0 then raise exception 'RESET_FUNCTION_CHANGED';end if;
   f:=replace(f,old_block,new_block);
  end if;
  execute f;
 end loop;
end $patch$;
-- An old open reset dialog must request a fresh code for the expanded scope.
update billflow_private.reset_challenges set cancelled=true where owner=(select owner from billflow_private.workspace where id=1) and used_at is null and not cancelled;
commit;
