-- All resets below affect newly-created synthetic users only, and the transaction rolls back.
-- The real owner's ledger, files, sessions, email nonce and LINE connection are never changed.
begin;
do $$
declare tester uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); sid2 uuid:=gen_random_uuid(); actual_owner uuid; original_revision bigint; original_payload jsonb; c jsonb; result jsonb; cid uuid; rev bigint; code_hash text; payload jsonb; job uuid; secret_a uuid; secret_b uuid; line_snapshot jsonb; ocr_snapshot jsonb;
begin
 select owner into actual_owner from billflow_private.workspace where id=1;
 select l.revision,l.payload into original_revision,original_payload from public.billflow_ledgers l where l.owner=actual_owner;
 insert into auth.users(id,email,email_confirmed_at) values(tester,'billflow-reset-fixture@example.invalid',now()),(outsider,'billflow-outsider-fixture@example.invalid',now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,tester,now(),now()),(sid2,tester,now(),now());
 update billflow_private.workspace set owner=tester where id=1;
 payload:=jsonb_set(billflow_private.default_payload(),'{entries}','[{"id":"qa-reset-entry","type":"income","date":"2026-10-29","title":"synthetic","amount":10000,"account":"cash","category":"อื่น ๆ","contact":"","note":""}]');
 insert into public.billflow_ledgers(owner,payload,revision) values(tester,payload,9);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',tester,'session_id',sid,'role','authenticated')::text,true);
 set local role authenticated;c:=public.billflow_begin_reset();cid:=(c->>'id')::uuid;
 begin perform public.billflow_begin_reset();raise exception 'COOLDOWN_BYPASSED';exception when others then if sqlerrm<>'RESET_RATE_LIMIT' then raise;end if;end;
 result:=public.billflow_confirm_reset(cid,'123456','wrong');if result->>'code'<>'PHRASE_MISMATCH' then raise exception 'PHRASE_NOT_CHECKED';end if;
 for i in 1..4 loop result:=public.billflow_confirm_reset(cid,'000000','ล้างข้อมูลทั้งหมด');if result->>'code'<>'OTP_INVALID' then raise exception 'BAD_OTP_ACCEPTED';end if;end loop;
 result:=public.billflow_confirm_reset(cid,'123456','ล้างข้อมูลทั้งหมด');if result->>'code'<>'RESET_EXPIRED' then raise exception 'ATTEMPT_LIMIT_BYPASSED';end if;
 reset role;
 if (select attempts from billflow_private.reset_challenges where id=cid)<>5 then raise exception 'ATTEMPTS_ROLLED_BACK';end if;
 -- A second fixture challenge exercises expiry, session binding, stale nonce, conflict and success.
 insert into billflow_private.reset_challenges(owner,session_id,email,revision) values(tester,sid,'billflow-reset-fixture@example.invalid',9) returning id into cid;
 code_hash:=encode(extensions.digest(convert_to('billflow-reset-fixture@example.invalid123456','UTF8'),'sha224'),'hex');
 update auth.users set reauthentication_token=code_hash,reauthentication_sent_at=now()-interval '1 second' where id=tester;
 set local role authenticated;result:=public.billflow_confirm_reset(cid,'123456','ล้างข้อมูลทั้งหมด');if result->>'code'<>'OTP_INVALID' then raise exception 'OLD_NONCE_ACCEPTED';end if;reset role;
 update auth.users set reauthentication_sent_at=now() where id=tester;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',tester,'session_id',sid2,'role','authenticated')::text,true);
 set local role authenticated;result:=public.billflow_confirm_reset(cid,'123456','ล้างข้อมูลทั้งหมด');if result->>'code'<>'RESET_EXPIRED' then raise exception 'OTHER_SESSION_ACCEPTED';end if;reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',tester,'session_id',sid,'role','authenticated')::text,true);
 update billflow_private.reset_challenges set expires_at=now()-interval '1 second' where id=cid;
 set local role authenticated;result:=public.billflow_confirm_reset(cid,'123456','ล้างข้อมูลทั้งหมด');if result->>'code'<>'RESET_EXPIRED' then raise exception 'EXPIRED_ACCEPTED';end if;reset role;
 update billflow_private.reset_challenges set expires_at=now()+interval '10 minutes',revision=8 where id=cid;
 set local role authenticated;result:=public.billflow_confirm_reset(cid,'123456','ล้างข้อมูลทั้งหมด');if result->>'code'<>'CONFLICT' then raise exception 'STALE_LEDGER_ACCEPTED';end if;reset role;
 update billflow_private.reset_challenges set revision=9 where id=cid;
 select vault.create_secret('synthetic-token-only') into secret_a;select vault.create_secret('synthetic-key-only') into secret_b;
 insert into public.billflow_line_settings(owner,bot_id,display_name,token_ref,secret_ref,group_id,group_name,enabled,pair_hash,pair_expires,updated_at) values(tester,'synthetic-bot','synthetic-line',secret_a,secret_b,'synthetic-group','first group',true,'synthetic-pair',now()+interval '5 minutes',now());
 insert into billflow_private.ocr_settings(owner,secret_ref,model) values(tester,secret_b,'first-model');
 -- Latest saved values, not the initial configuration, must survive.
 update public.billflow_line_settings set group_name='latest group',display_name='latest LINE name',types=array['expense'] where owner=tester;
 update billflow_private.ocr_settings set model='latest-gemini-model',secret_ref=secret_a where owner=tester;
 select to_jsonb(l) into line_snapshot from public.billflow_line_settings l where l.owner=tester;
 select to_jsonb(o) into ocr_snapshot from billflow_private.ocr_settings o where o.owner=tester;
 
 set local role authenticated;result:=public.billflow_confirm_reset(cid,'123456','ล้างข้อมูลทั้งหมด');if result->>'ok'<>'true' then raise exception 'VALID_RESET_FAILED:%',result;end if;
 result:=public.billflow_confirm_reset(cid,'123456','ล้างข้อมูลทั้งหมด');if result->>'code'<>'RESET_EXPIRED' then raise exception 'OTP_REPLAY_ACCEPTED';end if;
 begin perform public.billflow_reset_cleanup_claim(tester);raise exception 'CLIENT_CLAIMED_STORAGE';exception when insufficient_privilege then null;end;
 reset role;
 select l.revision,l.payload into rev,payload from public.billflow_ledgers l where l.owner=tester;
 if rev<>10 or jsonb_array_length(payload->'entries')<>0 then raise exception 'DATA_NOT_RESET';end if;
 if (select to_jsonb(l) from public.billflow_line_settings l where l.owner=tester) is distinct from line_snapshot or (select to_jsonb(o) from billflow_private.ocr_settings o where o.owner=tester) is distinct from ocr_snapshot then raise exception 'LATEST_SETUP_CHANGED';end if;
 if exists(select 1 from public.billflow_line_outbox where owner=tester) then raise exception 'RESET_SENT_DELETE_NOTICES';end if;
 set local role authenticated;c:=public.billflow_preserved_setup();if c->>'groupName'<>'latest group' or c->>'geminiModel'<>'latest-gemini-model' or c->>'lineEnabled'<>'true' then raise exception 'LATEST_SETUP_NOT_DISPLAYED';end if;reset role;
 update auth.users set email='billflow-new-owner-fixture@example.invalid' where id=tester;
 set local role authenticated;c:=public.billflow_preserved_setup();if c->>'ownerEmail'<>'billflow-new-owner-fixture@example.invalid' then raise exception 'OLD_OWNER_EMAIL_RESTORED';end if;reset role;
 if not exists(select 1 from auth.users where id=tester) or not exists(select 1 from auth.sessions where id=sid) then raise exception 'AUTH_DELETED';end if;
 update auth.sessions set not_after=now()-interval '1 second' where id=sid;
 set local role authenticated;begin perform public.billflow_begin_reset();raise exception 'EXPIRED_SESSION_ACCEPTED';exception when others then if sqlerrm<>'UNAUTHORIZED' then raise;end if;end;reset role;
 update auth.sessions set not_after=null where id=sid;
 insert into billflow_private.reset_cleanup(owner,paths) values(tester,array[tester::text||'/fixture-a',tester::text||'/fixture-b']) returning id into job;
 set local role service_role;c:=public.billflow_reset_cleanup_claim(outsider);if c is not null then raise exception 'CLEANUP_OWNER_FILTER_FAILED';end if;
 c:=public.billflow_reset_cleanup_claim(tester);if c->>'id'<>job::text then raise exception 'CLEANUP_CLAIM_FAILED';end if;
 perform public.billflow_reset_cleanup_finish(job,array[tester::text||'/fixture-a'],true);reset role;
 if (select cardinality(paths) from billflow_private.reset_cleanup where id=job)<>1 then raise exception 'PARTIAL_CLEANUP_LOST_PATHS';end if;
 set local role service_role;c:=public.billflow_reset_cleanup_claim(tester);perform public.billflow_reset_cleanup_finish(job,array[tester::text||'/fixture-b'],false);reset role;
 if (select status from billflow_private.reset_cleanup where id=job)<>'done' then raise exception 'CLEANUP_RETRY_FAILED';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'session_id',sid,'role','authenticated')::text,true);
 set local role authenticated;
 begin perform public.billflow_begin_reset();raise exception 'STAFF_RESET_ALLOWED';exception when others then if sqlerrm<>'OWNER_ONLY' then raise;end if;end;
 begin perform public.billflow_confirm_reset(cid,'123456','ล้างข้อมูลทั้งหมด');raise exception 'STAFF_CONFIRMED';exception when others then if sqlerrm<>'OWNER_ONLY' then raise;end if;end;
 reset role;
 if (select revision from public.billflow_ledgers where owner=actual_owner) is distinct from original_revision or (select l.payload from public.billflow_ledgers l where owner=actual_owner) is distinct from original_payload then raise exception 'REAL_OWNER_CHANGED';end if;
end $$;
rollback;
select 'Synthetic reset tests passed; real owner data unchanged; all fixtures rolled back' as result;
