begin;
-- Retain the exact current LINE settings. Disable only inside the reset transaction
-- while the financial trigger runs, then restore the current enabled value.
do $$
declare f text;
begin
 f:=pg_get_functiondef('billflow_private.confirm_reset(uuid,text,text)'::regprocedure);
 if position('line_enabled boolean' in f)=0 then f:=replace(f,'paths text[]; job uuid;','paths text[]; job uuid; line_enabled boolean;');end if;
 f:=replace(f,'update public.billflow_line_settings set enabled=false,updated_at=now() where owner=who;','select enabled into line_enabled from public.billflow_line_settings where owner=who for update; update public.billflow_line_settings set enabled=false where owner=who;');
 if position('if line_enabled is not null then' in f)=0 then f:=replace(f,'update billflow_private.reset_challenges set used_at=now()', 'if line_enabled is not null then update public.billflow_line_settings set enabled=line_enabled where owner=who;end if; update billflow_private.reset_challenges set used_at=now()');end if;execute f;
end $$;
create function billflow_private.preserved_setup() returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); result jsonb;
begin
 if who is null or not exists(select 1 from billflow_private.workspace where owner=who) then raise exception 'OWNER_ONLY';end if;
 select jsonb_build_object('ownerEmail',u.email,'pendingEmail',coalesce(u.email_change,''),'lineConfigured',l.owner is not null,'lineEnabled',coalesce(l.enabled,false),'groupName',coalesce(l.group_name,''),'groupConnected',l.group_id is not null,'pairCodePending',l.pair_hash is not null and l.pair_expires>now(),'webhookUrl','https://maxqjstknhwhymsugutz.supabase.co/functions/v1/billflow-line','geminiConfigured',o.secret_ref is not null,'geminiModel',coalesce(o.model,''),'lineUpdatedAt',l.updated_at)
 into result from auth.users u left join public.billflow_line_settings l on l.owner=u.id left join billflow_private.ocr_settings o on o.owner=u.id where u.id=who;
 return result;
end $$;
create function public.billflow_preserved_setup() returns jsonb language sql security invoker set search_path='' as $$select billflow_private.preserved_setup();$$;
revoke all on function billflow_private.preserved_setup(),public.billflow_preserved_setup() from public,anon,authenticated;
grant execute on function billflow_private.preserved_setup(),public.billflow_preserved_setup() to authenticated;
commit;
