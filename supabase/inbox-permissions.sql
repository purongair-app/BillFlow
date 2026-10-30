alter table public.billflow_members drop constraint billflow_members_check;
alter table public.billflow_members add constraint billflow_members_check check(edit_menus<@array['entries','accounts','people','debts','budgets','payroll','inbox'] and edit_menus<@menus);
alter table public.billflow_members drop constraint billflow_members_menus_check;
alter table public.billflow_members add constraint billflow_members_menus_check check(menus<@array['overview','entries','cashbook','accounts','people','debts','budgets','reports','payroll','inbox']);
CREATE OR REPLACE FUNCTION billflow_private.manage_members(p_action text, p_email text DEFAULT ''::text, p_name text DEFAULT ''::text, p_menus text[] DEFAULT '{}'::text[], p_edit text[] DEFAULT '{}'::text[], p_enabled boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare boss uuid; who uuid; result jsonb;
begin
 select owner into boss from billflow_private.workspace where id=1;
 if auth.uid() is null or auth.uid()<>boss then raise exception 'OWNER_ONLY';end if;
 if p_action='save' then
  if p_menus is null or p_edit is null or not(p_menus<@array['overview','entries','cashbook','accounts','people','debts','budgets','reports','payroll','inbox']) or not(p_edit<@array['entries','accounts','people','debts','budgets','payroll','inbox'] and p_edit<@p_menus) then raise exception 'INVALID_MENUS';end if;
  select id into who from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
  if who is null then raise exception 'ACCOUNT_NOT_FOUND';end if;
  if who=boss then raise exception 'CANNOT_CHANGE_OWNER';end if;
  insert into public.billflow_members(user_id,display_name,menus,edit_menus,enabled) values(who,trim(p_name),p_menus,p_edit,p_enabled)
  on conflict(user_id) do update set display_name=excluded.display_name,menus=excluded.menus,edit_menus=excluded.edit_menus,enabled=excluded.enabled,updated_at=now();
 elsif p_action<>'list' then raise exception 'INVALID_ACTION';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'email',u.email,'name',m.display_name,'menus',m.menus,'editMenus',m.edit_menus,'enabled',m.enabled,'updatedAt',m.updated_at) order by m.display_name),'[]') into result from public.billflow_members m join auth.users u on u.id=m.user_id;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION billflow_private.confirm_inbox(p_id uuid, p_target text, new_payload jsonb, expected_revision bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare doc public.billflow_line_inbox; next_revision bigint; old_payload jsonb; collection text; item jsonb; boss uuid; a jsonb; target_menu text;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED';end if;
 a:=billflow_private.access_context()->'access';
 select owner into boss from billflow_private.workspace where id=1;
 target_menu:=case when p_target='entry' then 'entries' when p_target='debt' then 'debts' when p_target='payroll' then 'payroll' else null end;
 if target_menu is null then raise exception 'INVALID_TARGET';end if;
 if auth.uid()<>boss and (not (a->'menus' ? 'inbox') or not(a->'editMenus' ? 'inbox') or not(a->'editMenus' ? target_menu)) then raise exception 'MENU_FORBIDDEN:inbox';end if;
 select * into doc from public.billflow_line_inbox where id=p_id and owner=boss for update;
 if doc.id is null or doc.status not in ('ready','needs_key','failed') or doc.file_size=0 then raise exception 'DRAFT_NOT_AVAILABLE';end if;
 if p_target not in ('entry','debt','payroll') then raise exception 'INVALID_TARGET';end if;
 collection:=case when p_target='entry' then 'entries' when p_target='payroll' then 'payroll' else 'debts' end;
 select payload into old_payload from public.billflow_ledgers where owner=boss for update;
 if exists(select 1 from jsonb_array_elements(coalesce(old_payload->collection,'[]')) x where x->>'id'=p_id::text) then raise exception 'ALREADY_IMPORTED';end if;
 select x into item from jsonb_array_elements(new_payload->collection) x where x->>'id'=p_id::text;
 if item is null or item->'file'->>'id' is distinct from doc.file_id::text then raise exception 'INVALID_IMPORT';end if;
 
 if p_target='payroll' and (item->>'status' is distinct from 'draft' or item->>'sourceDocumentId' is distinct from p_id::text or jsonb_typeof(item->'payments') is distinct from 'array' or jsonb_array_length(item->'payments')<>0 or coalesce(new_payload->'entries','[]') is distinct from coalesce(old_payload->'entries','[]') or coalesce(new_payload->'debts','[]') is distinct from coalesce(old_payload->'debts','[]')) then raise exception 'PAYROLL_IMPORT_DRAFT_ONLY';end if;
 next_revision:=billflow_private.save_workspace(new_payload,expected_revision);
 update public.billflow_line_inbox set status='confirmed',confirmed_target=p_target,updated_at=now() where id=p_id;
 return next_revision;
end $function$;

revoke all on function billflow_private.confirm_inbox(uuid,text,jsonb,bigint) from public,anon;
grant execute on function billflow_private.confirm_inbox(uuid,text,jsonb,bigint) to authenticated;
create or replace function public.billflow_confirm_inbox(p_id uuid,p_target text,new_payload jsonb,expected_revision bigint) returns bigint language sql security invoker set search_path='' as $$select billflow_private.confirm_inbox(p_id,p_target,new_payload,expected_revision);$$;
revoke update on public.billflow_line_inbox from authenticated;
create or replace function billflow_private.member_inbox(p_action text,p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare boss uuid; a jsonb; docs jsonb; ai record;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED';end if;
 select owner into boss from billflow_private.workspace where id=1;
 a:=billflow_private.access_context()->'access';
 if auth.uid()<>boss and not(a->'menus' ? 'inbox') then raise exception 'MENU_FORBIDDEN:inbox';end if;
 if p_action='inbox' then
  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc),'[]') into docs from (select id,file_id,mime,file_size,status,extracted,last_error,created_at,confirmed_target,duplicate_of from public.billflow_line_inbox where owner=boss order by created_at desc limit 100) d;
  select secret_ref,model into ai from billflow_private.ocr_settings where owner=boss;
  return jsonb_build_object('documents',docs,'ocrConfigured',ai.secret_ref is not null,'model',coalesce(ai.model,'gemini-3.5-flash-lite'));
 end if;
 if p_action not in ('inbox-retry','inbox-reject') then raise exception 'INVALID_ACTION';end if;
 if auth.uid()<>boss and not(a->'editMenus' ? 'inbox') then raise exception 'READ_ONLY';end if;
 if p_id is null then raise exception 'INVALID_DOCUMENT';end if;
 if p_action='inbox-retry' then
  update public.billflow_line_inbox set status='pending',attempts=0,last_error=null,updated_at=now() where owner=boss and id=p_id and status in ('needs_key','failed');
 else
  update public.billflow_line_inbox set status='rejected',updated_at=now() where owner=boss and id=p_id and status in ('pending','ready','needs_key','failed');
 end if;
 if not found then raise exception 'DRAFT_NOT_AVAILABLE';end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function billflow_private.member_inbox(text,uuid) from public,anon;
grant execute on function billflow_private.member_inbox(text,uuid) to authenticated;
create or replace function public.billflow_member_inbox(p_action text,p_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select billflow_private.member_inbox(p_action,p_id);$$;
revoke all on function public.billflow_member_inbox(text,uuid) from public,anon;
grant execute on function public.billflow_member_inbox(text,uuid) to authenticated;
-- Existing approved financial users can review the shop's shared LINE documents.
update public.billflow_members set menus=menus||array['inbox'],edit_menus=case when edit_menus&&array['entries','debts','payroll'] then edit_menus||array['inbox'] else edit_menus end,updated_at=now() where enabled and menus&&array['entries','debts','payroll'] and not('inbox'=any(menus));
create or replace function billflow_private.shared_receipt_access(folder text,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from billflow_private.workspace w where w.id=1 and w.owner::text=folder and
 (w.owner=auth.uid() or exists(select 1 from public.billflow_members m where m.user_id=auth.uid() and m.enabled and
 case when writing then m.edit_menus&&array['entries','debts','payroll'] else m.menus&&array['overview','entries','cashbook','accounts','debts','budgets','reports','payroll','inbox'] end)));
$$;
