-- SautiLink Base only. Review and apply to the dedicated Base database BEFORE
-- deploying the corresponding API revision. Do not run against SautiLink App.
-- Deliberately no client grants and no message/chat/token content.
create index if not exists user_bot_update_ledger_bot_created_idx
  on base_private.user_bot_update_ledger(bot_id, created_at desc);

-- The runtime cannot SELECT ledger status or timestamps. This narrow
-- SECURITY DEFINER aggregate is the only new read capability, and it also
-- verifies the authenticated owner's UUID supplied by the server after
-- Supabase Auth verification. The function lives in an unexposed schema.
create or replace function base_private.owner_bot_delivery_summary(
  p_bot_id uuid, p_owner_id uuid
) returns table (
  sent_24h bigint,
  ignored_24h bigint,
  unknown_7d bigint,
  processing_7d bigint,
  stale_processing_7d bigint,
  last_update_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select
    count(*) filter (where l.status = 'sent'
      and l.created_at >= now() - interval '24 hours'),
    count(*) filter (where l.status = 'ignored'
      and l.created_at >= now() - interval '24 hours'),
    count(*) filter (where l.status = 'unknown'),
    count(*) filter (where l.status = 'processing'),
    count(*) filter (where l.status = 'processing'
      and l.created_at < now() - interval '5 minutes'),
    max(l.created_at)
  from base_private.user_bot_update_ledger l
  where l.bot_id = p_bot_id
    and l.created_at >= now() - interval '7 days'
    and exists (
      select 1 from public.base_bots b
      where b.id = p_bot_id and b.owner_id = p_owner_id
    )
$$;

revoke all on function base_private.owner_bot_delivery_summary(uuid, uuid)
  from public, anon, authenticated;
grant execute on function base_private.owner_bot_delivery_summary(uuid, uuid)
  to base_api_runtime;

comment on function base_private.owner_bot_delivery_summary(uuid, uuid) is
  'Owner-scoped, server-only aggregate of user-bot delivery ledger. No chat content, update IDs or secrets. Seven-day diagnostic horizon.';
