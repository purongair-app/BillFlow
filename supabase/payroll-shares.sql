begin;
create table public.billflow_payroll_shares(
 id uuid primary key,owner uuid not null references auth.users(id),payroll_id text not null check(length(payroll_id) between 1 and 100),payment_id text,file_id uuid not null,kind text not null check(kind in ('payslip','receipt')),document_copy text not null check(document_copy in ('shop','employee')),group_id text not null,status text not null check(status in ('pending','sent','failed')),created_at timestamptz not null default now(),sent_at timestamptz,expires_at timestamptz
);
alter table public.billflow_payroll_shares enable row level security;
revoke all on public.billflow_payroll_shares from public,anon,authenticated;
grant all on public.billflow_payroll_shares to service_role;
create function billflow_private.payroll_share_usage() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='sent' and (tg_op='INSERT' or old.status is distinct from 'sent') then perform billflow_private.record_usage('line.payroll.share','payroll',new.payroll_id,'ส่งเอกสารเงินเดือน PDF ไปกลุ่ม LINE ที่เจ้าของยืนยัน',new.owner,'database',jsonb_build_object('shareId',new.id,'kind',new.kind));end if;return new;end $$;
revoke all on function billflow_private.payroll_share_usage() from public,anon,authenticated;
create trigger billflow_payroll_share_usage after insert or update on public.billflow_payroll_shares for each row execute function billflow_private.payroll_share_usage();
commit;
