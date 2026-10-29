begin;
create table billflow_private.reset_challenges(
 id uuid primary key default gen_random_uuid(),owner uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,email text not null,revision bigint not null,created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes',attempts int not null default 0,
 cancelled boolean not null default false,used_at timestamptz
);
create index on billflow_private.reset_challenges(owner,created_at desc);
create table billflow_private.reset_cleanup(
 id uuid primary key default gen_random_uuid(),owner uuid not null references auth.users(id) on delete cascade,
 paths text[] not null,status text not null default 'pending' check(status in ('pending','processing','done','failed')),
 attempts int not null default 0,created_at timestamptz not null default now(),claimed_at timestamptz,last_error text
);
revoke all on billflow_private.reset_challenges,billflow_private.reset_cleanup from public,anon,authenticated;

create function billflow_private.begin_reset() returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); sid uuid:=(auth.jwt()->>'session_id')::uuid; mail text; rev bigint; c billflow_private.reset_challenges;
begin
 if who is null or not exists(select 1 from billflow_private.workspace where owner=who) then raise exception 'OWNER_ONLY';end if;
 if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=who and (not_after is null or not_after>now())) then raise exception 'UNAUTHORIZED';end if;
 -- Serialize requests so the cooldown cannot be bypassed by concurrent calls.
 perform pg_advisory_xact_lock(hashtextextended('billflow-reset:'||who::text,0));
 select email into mail from auth.users where id=who and email_confirmed_at is not null;
 if coalesce(mail,'')='' then raise exception 'EMAIL_REQUIRED';end if;
 if exists(select 1 from billflow_private.reset_challenges where owner=who and created_at>now()-interval '60 seconds') or (select count(*) from billflow_private.reset_challenges where owner=who and created_at>now()-interval '1 hour')>=5 then raise exception 'RESET_RATE_LIMIT';end if;
 select coalesce(revision,0) into rev from public.billflow_ledgers where owner=who;
 update billflow_private.reset_challenges set cancelled=true where owner=who and used_at is null;
 insert into billflow_private.reset_challenges(owner,session_id,email,revision) values(who,sid,mail,coalesce(rev,0)) returning * into c;
 return jsonb_build_object('id',c.id,'email',mail,'expiresAt',c.expires_at,'phrase','ล้างข้อมูลทั้งหมด');
end $$;

create function billflow_private.confirm_reset(p_id uuid,p_code text,p_phrase text) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); sid uuid:=(auth.jwt()->>'session_id')::uuid; c billflow_private.reset_challenges; mail text; token text; sent timestamptz; rev bigint; paths text[]; job uuid; line_enabled boolean;
begin
 if who is null or not exists(select 1 from billflow_private.workspace where owner=who) then raise exception 'OWNER_ONLY';end if;
 if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=who and (not_after is null or not_after>now())) then raise exception 'UNAUTHORIZED';end if;
 select * into c from billflow_private.reset_challenges where id=p_id and owner=who and session_id=sid for update;
 if c.id is null or c.cancelled or c.used_at is not null or c.expires_at<=now() or c.attempts>=5 then return jsonb_build_object('ok',false,'code','RESET_EXPIRED');end if;
 if p_phrase is distinct from 'ล้างข้อมูลทั้งหมด' then update billflow_private.reset_challenges set attempts=attempts+1 where id=c.id;return jsonb_build_object('ok',false,'code','PHRASE_MISMATCH');end if;
 select email,reauthentication_token,reauthentication_sent_at into mail,token,sent from auth.users where id=who and email_confirmed_at is not null;
 -- Supabase Auth reauthentication OTP is SHA-224(email + OTP), as implemented by supabase/auth.
 -- Require a nonce sent AFTER this challenge, to the same confirmed account email.
 if mail is distinct from c.email or coalesce(p_code,'') !~ '^[0-9]{6,10}$' or sent is null or sent<c.created_at or sent<now()-interval '10 minutes' or coalesce(token,'')='' or token<>encode(extensions.digest(convert_to(mail||p_code,'UTF8'),'sha224'),'hex') then
  update billflow_private.reset_challenges set attempts=attempts+1 where id=c.id;return jsonb_build_object('ok',false,'code','OTP_INVALID');
 end if;
 lock table public.billflow_line_inbox,public.billflow_line_outbox in share row exclusive mode;
 if exists(select 1 from public.billflow_line_inbox where owner=who and status='processing' and processing_at>now()-interval '3 minutes') or exists(select 1 from public.billflow_line_outbox where owner=who and status='processing' and claimed_at>now()-interval '2 minutes') then return jsonb_build_object('ok',false,'code','WORK_IN_PROGRESS');end if;
 select revision into rev from public.billflow_ledgers where owner=who for update;
 if coalesce(rev,0)<>c.revision then return jsonb_build_object('ok',false,'code','CONFLICT');end if;
 select coalesce(array_agg(name),'{}') into paths from storage.objects where bucket_id='billflow-receipts' and split_part(name,'/',1)=who::text;
 insert into billflow_private.reset_cleanup(owner,paths,status) values(who,paths,case when cardinality(paths)=0 then 'done' else 'pending' end) returning id into job;
 -- Stop delivery before resetting the ledger, preventing delete notifications from being generated.
 select enabled into line_enabled from public.billflow_line_settings where owner=who for update; update public.billflow_line_settings set enabled=false where owner=who;
 delete from public.billflow_line_inbox where owner=who;
 delete from public.billflow_line_outbox where owner=who;
 if rev is null then
  insert into public.billflow_ledgers(owner,payload,revision) values(who,billflow_private.default_payload(),1);rev:=1;
 else
  update public.billflow_ledgers set payload=billflow_private.default_payload(),revision=revision+1,updated_at=now() where owner=who returning revision into rev;
 end if;
 if line_enabled is not null then update public.billflow_line_settings set enabled=line_enabled where owner=who;end if; update billflow_private.reset_challenges set used_at=now() where id=c.id;
 return jsonb_build_object('ok',true,'revision',rev,'cleanupId',job,'filesPending',cardinality(paths));
end $$;
create function public.billflow_begin_reset() returns jsonb language sql security invoker set search_path='' as $$select billflow_private.begin_reset();$$;
create function public.billflow_confirm_reset(p_id uuid,p_code text,p_phrase text) returns jsonb language sql security invoker set search_path='' as $$select billflow_private.confirm_reset(p_id,p_code,p_phrase);$$;

create function billflow_private.reset_cleanup_status() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from billflow_private.workspace where owner=auth.uid()) then raise exception 'OWNER_ONLY';end if;
 return (select jsonb_build_object('pending',coalesce(sum(cardinality(paths)),0),'failed',coalesce(bool_or(status='failed'),false)) from billflow_private.reset_cleanup where owner=auth.uid() and status<>'done');
end $$;
create function public.billflow_reset_cleanup_status() returns jsonb language sql security invoker set search_path='' as $$select billflow_private.reset_cleanup_status();$$;
-- Only the service worker receives Storage object paths. Never delete storage.objects with SQL.
create function public.billflow_reset_cleanup_claim(p_owner uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j billflow_private.reset_cleanup;
begin
 select * into j from billflow_private.reset_cleanup where (p_owner is null or owner=p_owner) and attempts<10 and (status='pending' or (status='processing' and claimed_at<now()-interval '3 minutes')) order by created_at limit 1 for update skip locked;
 if j.id is null then return null;end if;
 update billflow_private.reset_cleanup set status='processing',claimed_at=now(),attempts=attempts+1 where id=j.id;
 return jsonb_build_object('id',j.id,'owner',j.owner,'paths',j.paths);
end $$;
create function public.billflow_reset_cleanup_finish(p_id uuid,p_removed text[],p_failed boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare remaining text[];
begin
 select coalesce(array_agg(x),'{}') into remaining from billflow_private.reset_cleanup j cross join lateral unnest(j.paths) x where j.id=p_id and not(x=any(coalesce(p_removed,'{}')));
 update billflow_private.reset_cleanup set paths=remaining,status=case when cardinality(remaining)=0 then 'done' when attempts>=10 then 'failed' else 'pending' end,last_error=case when p_failed then 'ลบไฟล์บางส่วนไม่สำเร็จ' else null end where id=p_id;
end $$;
create function private.billflow_reset_tick() returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from billflow_private.reset_cleanup where attempts<10 and (status='pending' or (status='processing' and claimed_at<now()-interval '3 minutes'))) then return;end if;
 perform net.http_post(url:='https://maxqjstknhwhymsugutz.supabase.co/functions/v1/billflow-reset-cleanup',headers:=jsonb_build_object('Content-Type','application/json','x-billflow-worker',(select decrypted_secret from vault.decrypted_secrets where name='billflow_line_worker_key')),body:='{}',timeout_milliseconds:=60000);
end $$;
select cron.schedule('billflow-reset-cleanup','* * * * *','select private.billflow_reset_tick();');
revoke all on function billflow_private.begin_reset(),billflow_private.confirm_reset(uuid,text,text),public.billflow_begin_reset(),public.billflow_confirm_reset(uuid,text,text),billflow_private.reset_cleanup_status(),public.billflow_reset_cleanup_status(),public.billflow_reset_cleanup_claim(uuid),public.billflow_reset_cleanup_finish(uuid,text[],boolean),private.billflow_reset_tick() from public,anon,authenticated;
grant execute on function billflow_private.begin_reset(),billflow_private.confirm_reset(uuid,text,text),public.billflow_begin_reset(),public.billflow_confirm_reset(uuid,text,text),billflow_private.reset_cleanup_status(),public.billflow_reset_cleanup_status() to authenticated;
grant execute on function public.billflow_reset_cleanup_claim(uuid),public.billflow_reset_cleanup_finish(uuid,text[],boolean) to service_role;
commit;
