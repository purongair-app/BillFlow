begin;
create table public.billflow_line_inbox (
 id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id) on delete cascade,
 message_id text not null, group_id text not null, file_id uuid not null default gen_random_uuid(),
 mime text, file_size integer not null default 0 check(file_size between 0 and 5242880), content_hash text,
 status text not null default 'pending' check(status in ('pending','processing','ready','needs_key','failed','duplicate','confirmed','rejected')),
 extracted jsonb not null default '{}', last_error text, duplicate_of uuid references public.billflow_line_inbox(id),
 attempts integer not null default 0, processing_at timestamptz, confirmed_target text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner,message_id),unique(owner,content_hash)
);
create index billflow_inbox_queue on public.billflow_line_inbox(status,created_at);
alter table public.billflow_line_inbox enable row level security;
revoke all on public.billflow_line_inbox from public,anon,authenticated;
grant select,update on public.billflow_line_inbox to authenticated;
grant all on public.billflow_line_inbox to service_role;
create policy inbox_owner_select on public.billflow_line_inbox for select to authenticated using(owner=(select auth.uid()));
-- Updates are through the atomic confirmation RPC; column grants limit direct client writes.
revoke update on public.billflow_line_inbox from authenticated;
grant update(status,confirmed_target,updated_at) on public.billflow_line_inbox to authenticated;
create policy inbox_owner_confirm on public.billflow_line_inbox for update to authenticated using(owner=(select auth.uid()) and status in ('ready','needs_key','failed')) with check(owner=(select auth.uid()) and status='confirmed');
create function public.billflow_inbox_claim() returns setof public.billflow_line_inbox language sql security invoker set search_path='' as $$
 update public.billflow_line_inbox q set status='processing',processing_at=now(),attempts=attempts+1,updated_at=now()
 where q.id in (select id from public.billflow_line_inbox where attempts<3 and (status='pending' or (status='processing' and processing_at<now()-interval '3 minutes')) order by created_at limit 2 for update skip locked) returning q.*;
$$;
revoke all on function public.billflow_inbox_claim() from public,anon,authenticated;
grant execute on function public.billflow_inbox_claim() to service_role;
create schema if not exists billflow_private;
revoke all on schema billflow_private from public,anon,authenticated;
grant usage on schema billflow_private to service_role;
create table billflow_private.ocr_settings(owner uuid primary key references auth.users(id),secret_ref uuid references vault.secrets(id),model text not null default 'gemini-3.8-flash');
revoke all on billflow_private.ocr_settings from public,anon,authenticated;
grant all on billflow_private.ocr_settings to service_role;
create function billflow_private.ocr_config(p_owner uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('key',(select decrypted_secret from vault.decrypted_secrets where id=s.secret_ref),'model',s.model) from billflow_private.ocr_settings s where owner=p_owner;
$$;
create function billflow_private.ocr_store(p_owner uuid,p_key text,p_model text) returns void language plpgsql security definer set search_path='' as $$
declare ref uuid;
begin
 select secret_ref into ref from billflow_private.ocr_settings where owner=p_owner for update;
 if ref is null then ref:=vault.create_secret(p_key);else perform vault.update_secret(ref,p_key);end if;
 insert into billflow_private.ocr_settings(owner,secret_ref,model) values(p_owner,ref,p_model) on conflict(owner) do update set model=p_model;
end $$;
revoke all on function billflow_private.ocr_config(uuid),billflow_private.ocr_store(uuid,text,text) from public,anon,authenticated;
grant execute on function billflow_private.ocr_config(uuid),billflow_private.ocr_store(uuid,text,text) to service_role;
create function public.billflow_ocr_config(p_owner uuid) returns jsonb language sql security invoker set search_path='' as $$select billflow_private.ocr_config(p_owner);$$;
create function public.billflow_ocr_store(p_owner uuid,p_key text,p_model text) returns void language sql security invoker set search_path='' as $$select billflow_private.ocr_store(p_owner,p_key,p_model);$$;
revoke all on function public.billflow_ocr_config(uuid),public.billflow_ocr_store(uuid,text,text) from public,anon,authenticated;
grant execute on function public.billflow_ocr_config(uuid),public.billflow_ocr_store(uuid,text,text) to service_role;
create function public.billflow_confirm_inbox(p_id uuid,p_target text,new_payload jsonb,expected_revision bigint) returns bigint language plpgsql security invoker set search_path='' as $$
declare doc public.billflow_line_inbox; next_revision bigint; old_payload jsonb; collection text; item jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED';end if;
 select * into doc from public.billflow_line_inbox where id=p_id and owner=auth.uid() for update;
 if doc.id is null or doc.status not in ('ready','needs_key','failed') or doc.file_size=0 then raise exception 'DRAFT_NOT_AVAILABLE';end if;
 if p_target not in ('entry','debt') then raise exception 'INVALID_TARGET';end if;
 collection:=case when p_target='entry' then 'entries' else 'debts' end;
 select payload into old_payload from public.billflow_ledgers where owner=auth.uid() for update;
 if exists(select 1 from jsonb_array_elements(coalesce(old_payload->collection,'[]')) x where x->>'id'=p_id::text) then raise exception 'ALREADY_IMPORTED';end if;
 select x into item from jsonb_array_elements(new_payload->collection) x where x->>'id'=p_id::text;
 if item is null or item->'file'->>'id' is distinct from doc.file_id::text then raise exception 'INVALID_IMPORT';end if;
 next_revision:=public.billflow_save_ledger(new_payload,expected_revision);
 update public.billflow_line_inbox set status='confirmed',confirmed_target=p_target,updated_at=now() where id=p_id;
 return next_revision;
end $$;
revoke all on function public.billflow_confirm_inbox(uuid,text,jsonb,bigint) from public,anon;
grant execute on function public.billflow_confirm_inbox(uuid,text,jsonb,bigint) to authenticated;
commit;
