import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('all-menu reset handles approved/paid payroll and posted journals, repeats cleanly, and retains OTP/session guards in isolated Postgres',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create schema billflow_private;create schema private;create schema storage;create schema vault;create schema extensions;
   create extension pgcrypto with schema extensions;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',reauthentication_token text,reauthentication_sent_at timestamptz);
   create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz,updated_at timestamptz,not_after timestamptz);
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
   create table billflow_private.workspace(id int primary key,owner uuid);
   create table public.billflow_ledgers(owner uuid primary key,payload jsonb,revision bigint,updated_at timestamptz default now());
   create table public.billflow_line_inbox(owner uuid,status text,processing_at timestamptz);
   create table public.billflow_line_outbox(owner uuid,status text,claimed_at timestamptz);
   create table public.billflow_payroll_shares(id uuid,owner uuid);
   create table public.billflow_line_settings(owner uuid primary key,bot_id text,display_name text,token_ref uuid,secret_ref uuid,group_id text,group_name text,enabled boolean,pair_hash text,pair_expires timestamptz,updated_at timestamptz,types text[]);
   create table billflow_private.ocr_settings(owner uuid primary key,secret_ref uuid,model text);
   create table billflow_private.sso_access(user_id uuid primary key,secret_id uuid);
   create table billflow_private.shared_workspace_backup_20261030(owner uuid,payload jsonb);
   create table billflow_private.usage_events(subject_owner uuid,action text);
   create table storage.objects(bucket_id text,name text);
   create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text);
   create function vault.create_secret(value text) returns uuid language plpgsql as $$declare result uuid;begin insert into vault.secrets(secret) values(value) returning id into result;return result;end$$;
   create function public.billflow_access_only() returns jsonb language sql stable as $$select jsonb_build_object('owner',exists(select 1 from billflow_private.workspace where owner=auth.uid()),'editMenus','[]'::jsonb)$$;
   create function billflow_private.record_usage(text,text,text,text,uuid,text,jsonb) returns void language sql as $$insert into billflow_private.usage_events values($5,$1)$$;
   grant usage on schema public,auth,billflow_private to authenticated,service_role;
  `);
  const reset=await read('../supabase/system-reset.sql');
  await db.exec(reset.slice(reset.indexOf('create table billflow_private.reset_challenges'),reset.indexOf('create function billflow_private.begin_reset')));
  await db.exec(await read('./fixtures/reset-runtime-baseline.sql'));
  await db.exec(await read('./fixtures/reset-bill-baseline.sql'));
  const cleanup=reset.slice(reset.indexOf('create function public.billflow_reset_cleanup_claim'),reset.indexOf('create function private.billflow_reset_tick'));
  await db.exec(cleanup);
  await db.exec(`create function public.billflow_begin_reset() returns jsonb language sql as $$select billflow_private.begin_reset()$$;
   create function public.billflow_confirm_reset(p_id uuid,p_code text,p_phrase text) returns jsonb language sql as $$select billflow_private.confirm_reset(p_id,p_code,p_phrase)$$;
   create function billflow_private.preserved_setup() returns jsonb language sql security definer as $$select jsonb_build_object('ownerEmail',u.email,'groupName',l.group_name,'lineEnabled',l.enabled,'geminiModel',o.model) from auth.users u join public.billflow_line_settings l on l.owner=u.id join billflow_private.ocr_settings o on o.owner=u.id where u.id=auth.uid()$$;
   create function public.billflow_preserved_setup() returns jsonb language sql as $$select billflow_private.preserved_setup()$$;
   revoke all on function public.billflow_reset_cleanup_claim(uuid),public.billflow_reset_cleanup_finish(uuid,text[],boolean) from public,anon,authenticated;
   grant execute on function public.billflow_reset_cleanup_claim(uuid),public.billflow_reset_cleanup_finish(uuid,text[],boolean) to service_role;
  `);
  for(const name of ['payroll','bookkeeping','employee_details_numbering','employee_identity','bill_details','withholding','recurring']){
   await db.exec(`create trigger billflow_validate_${name} before insert or update on public.billflow_ledgers for each row execute function billflow_private.validate_${name}()`);
  }
  await db.exec(`create function private.qa_fail_reset_insert() returns trigger language plpgsql as $$begin if current_setting('billflow.qa_fail_reset',true)='yes' and new.payload->>'business'='ร้านของฉัน' then raise exception 'QA_DEFAULT_INSERT_FAILED';end if;return new;end$$;create trigger z_qa_fail_reset_insert before insert on public.billflow_ledgers for each row execute function private.qa_fail_reset_insert()`);
  const owner='00000000-0000-0000-0000-000000000001';
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${owner}','baseline@example.invalid',now());insert into billflow_private.workspace values(1,'${owner}');insert into public.billflow_ledgers(owner,payload,revision) values('${owner}',billflow_private.default_payload(),1)`);
  await db.exec(await read('../supabase/reset-all-menus.sql'));
  const result=await db.exec(await read('./reset-all-menus.sql'));
  assert.match(JSON.stringify(result),/Synthetic reset tests passed/);
  assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from billflow_private.reset_cleanup')).rows[0].n,0);
  assert.equal((await db.query('select revision from public.billflow_ledgers')).rows[0].revision,1);
 }finally{await db.close()}
});
