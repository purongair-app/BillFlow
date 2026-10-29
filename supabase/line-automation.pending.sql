begin;
-- Credentials are encrypted in Vault. These tables and RPCs are service-only.
create table public.billflow_line_settings (
 owner uuid primary key references auth.users(id) on delete cascade,
 basic_id text not null default '@191anfqj' check(basic_id='@191anfqj'),
 bot_id text not null, display_name text not null,
 token_ref uuid not null references vault.secrets(id), secret_ref uuid not null references vault.secrets(id),
 group_id text, group_name text, enabled boolean not null default false,
 types text[] not null default array['income','expense','transfer'],
 pair_hash text, pair_expires timestamptz, webhook_seen_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.billflow_line_outbox (
 id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id) on delete cascade,
 revision bigint not null, entry_id text not null, action text not null check(action in ('create','update','delete','test')),
 entry jsonb not null, business text not null, accounts jsonb not null, group_id text not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','cancelled')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 claimed_at timestamptz, last_error text, created_at timestamptz not null default now(), sent_at timestamptz,
 unique(owner,revision,entry_id,action)
);
create index billflow_line_queue_due on public.billflow_line_outbox(available_at) where status in ('pending','processing');
create index billflow_line_queue_owner on public.billflow_line_outbox(owner,created_at desc);
alter table public.billflow_line_settings enable row level security;
alter table public.billflow_line_outbox enable row level security;
revoke all on public.billflow_line_settings,public.billflow_line_outbox from public,anon,authenticated;
grant all on public.billflow_line_settings,public.billflow_line_outbox to service_role;

create function public.billflow_line_credentials(p_owner uuid) returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(s)||jsonb_build_object('token',(select decrypted_secret from vault.decrypted_secrets where id=s.token_ref),'secret',(select decrypted_secret from vault.decrypted_secrets where id=s.secret_ref)) from public.billflow_line_settings s where owner=p_owner;
$$;
create function public.billflow_line_store_credentials(p_owner uuid,p_token text,p_secret text,p_bot text,p_name text) returns void language plpgsql security definer set search_path='' as $$
declare t uuid; k uuid;
begin
 select token_ref,secret_ref into t,k from public.billflow_line_settings where owner=p_owner for update;
 if t is null then
  t:=vault.create_secret(p_token);k:=vault.create_secret(p_secret);
 else
  perform vault.update_secret(t,p_token);perform vault.update_secret(k,p_secret);
 end if;
 insert into public.billflow_line_settings(owner,bot_id,display_name,token_ref,secret_ref) values(p_owner,p_bot,p_name,t,k)
 on conflict(owner) do update set bot_id=p_bot,display_name=p_name,updated_at=now();
end $$;

create function private.billflow_line_enqueue() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg public.billflow_line_settings; previous jsonb; changed jsonb; operation text;
begin
 select * into cfg from public.billflow_line_settings where owner=new.owner;
 if not found or not cfg.enabled or cfg.group_id is null then return new; end if;
 -- A restored/new ledger is the baseline: never broadcast its historical contents.
 if tg_op='INSERT' then return new; end if;
 for changed in select value from jsonb_array_elements(new.payload->'entries') loop
  select value into previous from jsonb_array_elements(old.payload->'entries') where value->>'id'=changed->>'id';
  if previous is not null and previous=changed then continue;end if;
  if not (changed->>'type'=any(cfg.types)) then continue;end if;
  operation:=case when previous is null then 'create' else 'update' end;
  insert into public.billflow_line_outbox(owner,revision,entry_id,action,entry,business,accounts,group_id) values(new.owner,new.revision,changed->>'id',operation,changed,new.payload->>'business',new.payload->'accounts',cfg.group_id) on conflict do nothing;
 end loop;
 for changed in select value from jsonb_array_elements(old.payload->'entries') e where not exists(select 1 from jsonb_array_elements(new.payload->'entries') n where n->>'id'=e->>'id') loop
  if changed->>'type'=any(cfg.types) then
   insert into public.billflow_line_outbox(owner,revision,entry_id,action,entry,business,accounts,group_id) values(new.owner,new.revision,changed->>'id','delete',changed,new.payload->>'business',old.payload->'accounts',cfg.group_id) on conflict do nothing;
  end if;
 end loop;
 return new;
end $$;
create trigger billflow_line_changes after insert or update on public.billflow_ledgers for each row execute function private.billflow_line_enqueue();

create function public.billflow_line_claim(p_owner uuid default null) returns setof public.billflow_line_outbox language sql security invoker set search_path='' as $$
 update public.billflow_line_outbox q set status='processing',claimed_at=now(),attempts=attempts+1
 where q.id in (select x.id from public.billflow_line_outbox x join public.billflow_line_settings c on c.owner=x.owner and (c.enabled or x.action='test') and c.group_id=x.group_id
 where (p_owner is null or x.owner=p_owner) and x.attempts<8 and x.available_at<=now() and (x.status='pending' or (x.status='processing' and x.claimed_at<now()-interval '2 minutes')) order by x.created_at limit 10 for update of x skip locked) returning q.*;
$$;
-- An internal worker key never leaves Vault or the server-to-server request.
select vault.create_secret(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'billflow_line_worker_key');
create function public.billflow_line_check_worker(p_key text) returns boolean language sql security definer set search_path='' as $$
 select length(p_key)=64 and p_key=(select decrypted_secret from vault.decrypted_secrets where name='billflow_line_worker_key');
$$;
create function private.billflow_line_tick() returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.billflow_line_outbox q join public.billflow_line_settings c on c.owner=q.owner and (c.enabled or q.action='test') and c.group_id=q.group_id where q.status in ('pending','processing') and q.attempts<8 and q.available_at<=now()) then return;end if;
 perform net.http_post(url:='https://maxqjstknhwhymsugutz.supabase.co/functions/v1/billflow-line',headers:=jsonb_build_object('Content-Type','application/json','x-billflow-worker',(select decrypted_secret from vault.decrypted_secrets where name='billflow_line_worker_key')),body:='{"action":"process"}'::jsonb,timeout_milliseconds:=30000);
end $$;
select cron.schedule('billflow-line-outbox','* * * * *','select private.billflow_line_tick();');
revoke all on function private.billflow_line_enqueue(),private.billflow_line_tick() from public,anon,authenticated;
revoke all on function public.billflow_line_credentials(uuid),public.billflow_line_store_credentials(uuid,text,text,text,text),public.billflow_line_claim(uuid),public.billflow_line_check_worker(text) from public,anon,authenticated;
grant execute on function public.billflow_line_credentials(uuid),public.billflow_line_store_credentials(uuid,text,text,text,text),public.billflow_line_claim(uuid),public.billflow_line_check_worker(text) to service_role;
commit;
