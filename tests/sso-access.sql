begin;
do $test$
declare who uuid; other_user uuid; marker text:='QA-'||gen_random_uuid()::text; r jsonb; v bigint; test_secret_id uuid; cipher text;
begin
 select owner into who from billflow_private.workspace where id=1;
 if exists(select 1 from billflow_private.sso_access where user_id=who) then raise exception 'TEST_REQUIRES_EMPTY_OWNER_SLOT';end if;
 perform set_config('request.jwt.claim.sub',who::text,true);
 r:=public.billflow_sso_access('save','https://www.sso.go.th/','qa',marker,0);v:=(r->>'version')::bigint;
 r:=public.billflow_sso_access('read');if r->>'password' is distinct from marker then raise exception 'READ_BACK_FAILED';end if;
 select a.secret_id into test_secret_id from billflow_private.sso_access a where user_id=who;
 select s.secret into cipher from vault.secrets s where s.id=test_secret_id;
 if position(marker in cipher)>0 then raise exception 'NOT_ENCRYPTED';end if;
 begin perform public.billflow_sso_access('save','https://www.sso.go.th/','qa',marker,0);raise exception 'STALE_SAVE_ALLOWED';exception when others then if sqlerrm<>'CONFLICT' then raise;end if;end;
 r:=public.billflow_sso_access('save','https://www.sso.go.th/','qa2',marker||'-updated',v);v:=(r->>'version')::bigint;
 r:=public.billflow_sso_access('read');if r->>'password' is distinct from marker||'-updated' then raise exception 'UPDATE_FAILED';end if;
 select id into other_user from auth.users where id<>who limit 1;
 if other_user is not null then
  perform set_config('request.jwt.claim.sub',other_user::text,true);
  begin r:=public.billflow_sso_access('read');if r->>'saved'='true' then raise exception 'CROSS_USER_LEAK';end if;exception when others then if sqlerrm<>'MENU_FORBIDDEN' then raise;end if;end;
 end if;
 perform set_config('request.jwt.claim.sub',who::text,true);
 perform public.billflow_sso_access('delete',p_version=>v);
 if exists(select 1 from vault.secrets where id=test_secret_id) then raise exception 'SECRET_NOT_CLEANED';end if;
 if has_table_privilege('authenticated','billflow_private.sso_access','SELECT') or has_table_privilege('authenticated','vault.decrypted_secrets','SELECT') or has_function_privilege('anon','public.billflow_sso_access(text,text,text,text,bigint)','EXECUTE') then raise exception 'EXCESSIVE_GRANTS';end if;
 if not has_function_privilege('authenticated','public.billflow_sso_access(text,text,text,text,bigint)','EXECUTE') then raise exception 'RPC_GRANT_MISSING';end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.billflow_sso_access('read');raise exception 'UNAUTHENTICATED_ALLOWED';exception when others then if sqlerrm<>'UNAUTHORIZED' then raise;end if;end;
end $test$;
select 'encrypted create/read/update/delete, stale-save rejection, cross-account isolation and role grants passed; all fixtures rolled back' as validation;
rollback;
