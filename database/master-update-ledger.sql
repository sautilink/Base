create table if not exists base_private.master_update_ledger (
 update_id bigint primary key,
 status text not null check (status in ('processing','sent','unknown')),
 created_at timestamptz not null default now()
);
alter table base_private.master_update_ledger enable row level security;
revoke all on base_private.master_update_ledger from anon, authenticated, public;