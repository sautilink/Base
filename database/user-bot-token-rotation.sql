-- Apply ONLY to the dedicated sautilink-base Supabase project.
-- Revoked/rotated BotFather tokens can be replaced only for bots that are
-- inactive and belong to the verified owner supplied by the trusted API.
-- Do NOT grant unrestricted UPDATE on base_private.bot_credentials.
create or replace function base_private.rotate_owner_bot_credential(
  p_bot_id uuid, p_owner_id uuid, p_ciphertext bytea
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if p_ciphertext is null or octet_length(p_ciphertext) < 29 then
    return false;
  end if;

  -- Row lock serializes replacement against concurrent bot-status UPDATE.
  perform 1 from public.base_bots b
    where b.id = p_bot_id and b.owner_id = p_owner_id and b.status = 'inactive'
    for update;
  if not found then return false; end if;

  update base_private.bot_credentials c
    set token_ciphertext = p_ciphertext, key_version = 1, updated_at = now()
    where c.bot_id = p_bot_id and c.key_version = 1;
  return found;
end;
$$;
revoke all on function base_private.rotate_owner_bot_credential(uuid,uuid,bytea)
  from public, anon, authenticated;
grant execute on function base_private.rotate_owner_bot_credential(uuid,uuid,bytea)
  to base_api_runtime;
