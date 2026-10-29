begin;
create table billflow_private.usage_metadata(id boolean primary key default true check(id),started_at timestamptz not null default now());
insert into billflow_private.usage_metadata(id) values(true);
revoke all on billflow_private.usage_metadata from public,anon,authenticated;
-- Keep older local history distinct from events captured by the new server recorder.
do $$ declare f text;begin
 f:=pg_get_functiondef('billflow_private.usage_history(bigint,date,date,text,text)'::regprocedure);
 f:=replace(f,'''events'',rows,','''recordingStartedAt'',(select started_at from billflow_private.usage_metadata where id),''events'',rows,');execute f;
 f:=pg_get_functiondef('billflow_private.settings_usage()'::regprocedure);
 f:=replace(f,'if current=previous then return new;end if;', 'if current=previous then return new;end if; if tg_table_name=''billflow_line_inbox'' and tg_op=''UPDATE'' and current->''status''=previous->''status'' then return new;end if; if tg_table_name=''billflow_line_outbox'' and (current->>''status'' not in (''sent'',''failed'') or current->''status''=previous->''status'') then return new;end if;');
 f:=replace(f,'when ''reset_challenges'' then ''ยืนยันล้างข้อมูลการเงินทั้งหมดสำเร็จ''', 'when ''billflow_line_inbox'' then case current->>''status'' when ''pending'' then ''รับเอกสารจาก LINE'' when ''processing'' then ''เริ่มอ่านรูปเอกสาร LINE'' when ''ready'' then ''อ่านรูปเอกสาร LINE สำเร็จ'' when ''failed'' then ''อ่านรูปเอกสาร LINE ไม่สำเร็จ'' when ''confirmed'' then ''ยืนยันนำเข้าเอกสาร LINE'' when ''rejected'' then ''ปฏิเสธเอกสาร LINE'' when ''duplicate'' then ''ตรวจพบเอกสาร LINE ซ้ำ'' else ''รอตั้งค่าตัวอ่านรูป'' end when ''billflow_line_outbox'' then case current->>''status'' when ''sent'' then ''LINE รับคำขอแจ้งเตือนสำเร็จ'' else ''ส่งแจ้งเตือน LINE ไม่สำเร็จ'' end when ''reset_challenges'' then ''ยืนยันล้างข้อมูลการเงินทั้งหมดสำเร็จ''');execute f;
end $$;
create trigger billflow_usage_inbox after insert or update on public.billflow_line_inbox for each row execute function billflow_private.settings_usage();
create trigger billflow_usage_outbox after update on public.billflow_line_outbox for each row execute function billflow_private.settings_usage();
commit;
