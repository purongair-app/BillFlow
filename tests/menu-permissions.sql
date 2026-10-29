begin;
do $$
declare boss uuid; worker uuid; ctx jsonb; payload jsonb; rev bigint; after_rev bigint; original_owner_revision bigint; boss_email text;
begin
 select owner into boss from billflow_private.workspace where id=1;
 select email into boss_email from auth.users where id=boss;
 select revision into original_owner_revision from public.billflow_ledgers where owner=boss;
 select u.id into worker from auth.users u left join public.billflow_ledgers l on l.owner=u.id where u.id<>boss and l.owner is null limit 1;
 if worker is null then raise exception 'NO_UNUSED_TEST_ACCOUNT';end if;
 insert into public.billflow_members(user_id,display_name,menus,edit_menus) values(worker,'QA rollback',array['people'],array['people']);
 perform set_config('request.jwt.claim.sub',worker::text,true);set local role authenticated;
 ctx:=public.billflow_access_context();payload:=ctx->'payload';rev:=(ctx->>'revision')::bigint;
 if ctx->'access'->>'owner'<>'false' or ctx->'access'->>'workspaceOwner'<>worker::text then raise exception 'BAD_STAFF_CONTEXT';end if;
 if jsonb_array_length(payload->'entries')<>0 or jsonb_array_length(payload->'debts')<>0 or payload->'accounts'->0->>'id'<>'restricted' then raise exception 'FINANCIAL_DATA_EXPOSED';end if;
 begin perform public.billflow_manage_members('list');raise exception 'STAFF_MANAGED_PERMISSIONS';exception when others then if sqlerrm<>'OWNER_ONLY' then raise;end if;end;
 begin perform public.billflow_save_workspace(jsonb_set(payload,'{entries}','[{"id":"forbidden"}]'),rev);raise exception 'UNAUTHORIZED_WRITE_ACCEPTED';exception when others then if sqlerrm not like 'MENU_FORBIDDEN:%' then raise;end if;end;
 payload:=jsonb_set(payload,'{contacts}','[{"id":"qa-contact","code":"QA-TEST","name":"QA rollback","note":"","active":true,"kind":"customer"}]');
 after_rev:=public.billflow_save_workspace(payload,rev);if after_rev<>1 then raise exception 'BAD_REVISION';end if;
 ctx:=public.billflow_access_context();if jsonb_array_length(ctx->'payload'->'contacts')<>1 then raise exception 'AUTHORIZED_SAVE_FAILED';end if;
 reset role;
 if (select revision from public.billflow_ledgers where owner=boss)<>original_owner_revision then raise exception 'OWNER_DATA_CHANGED';end if;
 update public.billflow_members set enabled=false where user_id=worker;
 set local role authenticated;ctx:=public.billflow_access_context();if jsonb_array_length(ctx->'access'->'menus')<>0 or ctx->'payload'<>'null'::jsonb then raise exception 'REVOCATION_FAILED';end if;
 begin perform public.billflow_save_workspace(payload,after_rev);raise exception 'REVOKED_WRITE_ACCEPTED';exception when others then if sqlerrm<>'READ_ONLY' then raise;end if;end;
 reset role;
 perform set_config('request.jwt.claim.sub',boss::text,true);set local role authenticated;ctx:=public.billflow_access_context();if ctx->'access'->>'owner'<>'true' then raise exception 'OWNER_RIGHTS_LOST';end if;
 begin perform public.billflow_manage_members('save',boss_email,'owner','{}','{}',false);raise exception 'OWNER_REMOVED';exception when others then if sqlerrm<>'CANNOT_CHANGE_OWNER' then raise;end if;end;
 reset role;
end $$;
do $$
declare boss uuid; worker uuid; worker_email text; rows jsonb; row_data jsonb;
begin
 select owner into boss from billflow_private.workspace where id=1;
 select id,email into worker,worker_email from auth.users where id<>boss and email_confirmed_at is not null limit 1;
 if worker is null then raise exception 'NO_CONFIRMED_TEST_ACCOUNT';end if;
 perform set_config('request.jwt.claim.sub',boss::text,true);set local role authenticated;
 rows:=public.billflow_manage_members_v2('save',worker_email,'QA roles',array['people'],'{}',true,'manager');
 select x into row_data from jsonb_array_elements(rows) x where x->>'id'=worker::text;
 if row_data->>'role'<>'manager' or jsonb_array_length(row_data->'editMenus')<>0 or row_data->'menus'<>'["people"]'::jsonb then raise exception 'ROLE_GRANTED_EXTRA_RIGHTS';end if;
 reset role;perform set_config('request.jwt.claim.sub',worker::text,true);set local role authenticated;
 begin perform public.billflow_manage_members_v2('list');raise exception 'MANAGER_ADMIN_ESCALATION';exception when others then if sqlerrm<>'OWNER_ONLY' then raise;end if;end;
 reset role;
end $$;
rollback;
