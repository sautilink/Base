-- SautiLink Base only. Operational functions; no automated cron is installed.
-- Terminal Telegram update IDs should remain for >=180 days by default to
-- preserve deduplication across ordinary retries and incident investigation.
-- Ambiguous/unfinished updates are NEVER pruned by this routine.

create or replace function base_private.preview_user_bot_ledger_retention(
  p_days integer default 180
)
returns table(eligible_terminal bigint, unresolved bigint)
language plpgsql security invoker set search_path = ''
as $$
begin
  if p_days < 90 or p_days > 3650 or p_days is null then
    raise exception 'Retention age must be between 90 and 3650 days';
  end if;
  return query select
    count(*) filter (where u.status in ('sent','ignored') and
      u.created_at < now() - make_interval(days => p_days))::bigint,
    count(*) filter (where u.status in ('unknown','processing'))::bigint
    from base_private.user_bot_update_ledger u;
end;
$$;

create or replace function base_private.prune_user_bot_terminal_updates(
  p_days integer default 180, p_batch_size integer default 500
)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare affected integer;
begin
  if p_days < 90 or p_days > 3650 or p_days is null then
    raise exception 'Retention age must be between 90 and 3650 days';
  end if;
  if p_batch_size < 1 or p_batch_size > 1000 or p_batch_size is null then
    raise exception 'Batch size must be between 1 and 1000';
  end if;
  with old_terminal as (
    select u.ctid from base_private.user_bot_update_ledger u
    where u.status in ('sent','ignored')
      and u.created_at < now() - make_interval(days => p_days)
    order by u.created_at
    limit p_batch_size
    for update skip locked
  )
  delete from base_private.user_bot_update_ledger u
  using old_terminal c
  where u.ctid = c.ctid;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- PostgreSQL defaults grant EXECUTE to PUBLIC; remove it explicitly.
-- Only a trusted database operator / owner may invoke these.
revoke all on function base_private.preview_user_bot_ledger_retention(integer)
  from public, anon, authenticated, base_api_runtime;
revoke all on function base_private.prune_user_bot_terminal_updates(integer,integer)
  from public, anon, authenticated, base_api_runtime;
comment on function base_private.prune_user_bot_terminal_updates(integer,integer) is
  'Manual operator-only, bounded cleanup of terminal deliveries older than >=90d; unknown and processing are excluded.';
