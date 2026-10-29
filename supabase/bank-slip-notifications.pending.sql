begin;
-- Stable message payloads preserve LINE retry idempotency, including temporary media URLs.
alter table public.billflow_line_outbox add column line_messages jsonb;
alter table public.billflow_line_outbox add column media_expires_at timestamptz;
create or replace function private.billflow_line_enqueue() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg public.billflow_line_settings; changed jsonb; operation text; account_snapshot jsonb;
begin
 select * into cfg from public.billflow_line_settings where owner=new.owner;
 if not found or not cfg.enabled or cfg.group_id is null or cfg.enabled_at is null then return new;end if;
 -- First save and explicit backup restores establish a baseline. Never replay history.
 if tg_op='INSERT' or new.payload#>>'{audit,0,text}'='กู้คืนข้อมูลจากไฟล์สำรอง' then return new;end if;
 for changed,operation in
  select coalesce(n.value,o.value),case when o.value is null then 'create' when n.value is null then 'delete' else 'update' end
  from jsonb_array_elements(new.payload->'entries') n
  full join jsonb_array_elements(old.payload->'entries') o on n.value->>'id'=o.value->>'id'
  where n.value is distinct from o.value
 loop
  if not (changed->>'type'=any(cfg.types)) then continue;end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a->>'id','name',a->>'name','bankName',a->>'bankName','accountHolder',a->>'accountHolder','accountNumber',a->>'accountNumber')),'[]'::jsonb)
  into account_snapshot from jsonb_array_elements(case when operation='delete' then old.payload->'accounts' else new.payload->'accounts' end) a
  where a->>'id' in (changed->>'account',changed->>'to');
  -- Store only the fields actually used by the approved notification template.
  insert into public.billflow_line_outbox(owner,revision,entry_id,action,entry,business,accounts,group_id)
  values(new.owner,new.revision,changed->>'id',operation,
   jsonb_build_object('id',changed->>'id','type',changed->>'type','date',changed->>'date','documentNo',changed->>'documentNo','title',changed->>'title','amount',changed->'amount','account',changed->>'account','to',changed->>'to','transactionTime',changed->>'transactionTime','transferRef',changed->>'transferRef','contact',changed->>'contact','senderName',changed->>'senderName','senderBank',changed->>'senderBank','senderAccount',changed->>'senderAccount','receiverName',changed->>'receiverName','receiverBank',changed->>'receiverBank','receiverAccount',changed->>'receiverAccount','file',changed->'file','slipReview',changed->>'slipReview'),
   new.payload->>'business',account_snapshot,cfg.group_id) on conflict do nothing;
 end loop;
 return new;
end $$;
revoke all on function private.billflow_line_enqueue() from public,anon,authenticated;
commit;
