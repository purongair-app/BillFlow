begin;
-- Fail closed: the existing reset flow must not delete evidence while accounting records are protected.
do $migration$
declare f text; signature text; guard text;
begin
 guard:=$guard$
 if exists(select 1 from public.billflow_ledgers where owner=who and payload->'bookkeeping' is not null and payload->'bookkeeping'<>'null'::jsonb) then raise exception 'ACCOUNTING_RESET_NOT_READY';end if;
$guard$;
 foreach signature in array array['billflow_private.begin_reset()','billflow_private.confirm_reset(uuid,text,text)'] loop
  if to_regprocedure(signature) is null then continue;end if;
  f:=pg_get_functiondef(to_regprocedure(signature));
  if position('ACCOUNTING_RESET_NOT_READY' in f)=0 then
   if position('if sid is null' in f)=0 then raise exception 'RESET_CHECK_CHANGED';end if;
   f:=replace(f,'if sid is null',guard||E'\n if sid is null');execute f;
  end if;
 end loop;
end $migration$;
commit;
