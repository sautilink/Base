-- SautiLink Base migration 2 + 3 (applied to dedicated Base Supabase on 2026-10-26).
-- Bot creation and editing require server-side BotFather token verification.
-- Browser clients can SELECT their own bot records, but cannot forge Telegram bot identities.
revoke insert, update, delete on public.base_bots from authenticated;
revoke insert, update, delete on public.base_commands, public.base_menu_items, public.base_reply_rules from authenticated;
comment on table public.base_bots is 'Bot registration and mutations are server-only until verified Telegram ownership endpoints are implemented.';

-- Remove implicit broad table privileges; RLS is not a substitute for grants.
revoke truncate, references, trigger on
  public.base_profiles, public.base_bots, public.base_commands,
  public.base_menu_items, public.base_reply_rules from authenticated, anon;
revoke delete on public.base_profiles from authenticated;
revoke all on
  public.base_profiles, public.base_bots, public.base_commands,
  public.base_menu_items, public.base_reply_rules from anon;
grant select on
  public.base_bots, public.base_commands, public.base_menu_items,
  public.base_reply_rules to authenticated;
