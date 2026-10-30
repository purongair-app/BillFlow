begin;
do $test$
declare boss uuid; worker uuid; d uuid:=gen_random_uuid(); file_id uuid:=gen_random_uuid(); ctx jsonb; payload jsonb; rev bigint; res jsonb; actual jsonb;
begin
 select owner into boss from billflow_private.workspace where id=1;
 select user_id into worker from public.billflow_members where enabled and 'entries'=any(edit_menus) limit 1;
 insert into public.billflow_line_inbox(id,owner,message_id,group_id,file_id,file_size,mime,status) values(d,boss,'qa-permission-'||d,'qa-rollback',file_id,100,'image/jpeg','ready');
 perform set_config('request.jwt.claim.sub',worker::text,true);set local role authenticated;
 res:=public.billflow_member_inbox('inbox');
 if not exists(select 1 from jsonb_array_elements(res->'documents') x where x->>'id'=d::text) or res ? 'key' then raise exception 'READ_FAILED_OR_KEY_EXPOSED';end if;
 ctx:=public.billflow_access_context();payload:=ctx->'payload';rev:=(ctx->>'revision')::bigint;
 payload:=jsonb_set(payload,'{entries}',(payload->'entries')||jsonb_build_array(jsonb_build_object('id',d,'type','expense','amount',100,'date','2026-10-30','title','QA permission rollback','category','อื่น ๆ','account',payload->'accounts'->0->>'id','file',jsonb_build_object('id',file_id,'name','QA.jpg','mime','image/jpeg','size',100))));
 rev:=public.billflow_confirm_inbox(d,'entry',payload,rev);
 begin perform public.billflow_confirm_inbox(d,'entry',payload,rev);raise exception 'DOUBLE_IMPORT_ACCEPTED';exception when others then if sqlerrm<>'DRAFT_NOT_AVAILABLE' then raise;end if;end;
 reset role;
 select l.payload into actual from public.billflow_ledgers l where owner=boss;
 if not exists(select 1 from jsonb_array_elements(actual->'entries') x where x->>'id'=d::text) or (select status from public.billflow_line_inbox where id=d)<>'confirmed' then raise exception 'ATOMIC_IMPORT_FAILED';end if;
 update public.billflow_members set edit_menus=array_remove(edit_menus,'inbox') where user_id=worker;
 perform set_config('request.jwt.claim.sub',worker::text,true);set local role authenticated;
 perform public.billflow_member_inbox('inbox');
 begin perform public.billflow_member_inbox('inbox-reject',d);raise exception 'VIEWER_WRITE_ACCEPTED';exception when others then if sqlerrm<>'READ_ONLY' then raise;end if;end;
 reset role;
 update public.billflow_members set menus=array_remove(menus,'inbox') where user_id=worker;
 set local role authenticated;
 begin perform public.billflow_member_inbox('inbox');raise exception 'UNAUTHORIZED_READ';exception when others then if sqlerrm<>'MENU_FORBIDDEN:inbox' then raise;end if;end;
 begin perform public.billflow_confirm_inbox(d,'entry',payload,rev);raise exception 'UNAUTHORIZED_CONFIRM';exception when others then if sqlerrm<>'MENU_FORBIDDEN:inbox' then raise;end if;end;
 reset role;
end $test$;
rollback;
