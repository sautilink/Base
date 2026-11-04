# User-bot connection API (restricted test mode)

The existing @SautiLinkBaseBot is a separate, working master bot on staging. The user-bot route is enabled only for two named Base test accounts; do not submit the master token to it. A rolled-back SQL test showed that each account could read only its own bot, command, reply rule and menu fixture. Two live master-bot token attempts were rejected with token-free `master_bot` audit outcomes and created no bot rows. A separate BotFather bot was then connected: one inactive bot row, one encrypted private credential, and one `connected` audit outcome were verified without reading the token. With that real row, the owner saw one bot under RLS and the other Base account saw zero.

`POST /bots/connect` accepts `{ "token": "..." }` and an `Authorization: Bearer <Supabase user access token>` header.

1. Validates authentication by querying the **Base** Supabase Auth `/auth/v1/user` endpoint.
2. Validates bot ownership *capability* using Telegram Bot API `getMe`. Anyone holding a bot token controls that bot; the API cannot independently prove BotFather account ownership.
3. Inserts a Telegram bot row with default status `inactive`.
4. Encrypts bot token with AES-256-GCM before storing in `base_private.bot_credentials`, in one database transaction.
5. Never returns or logs a bot token.

### Server environment (do not commit actual values)
- `SUPABASE_URL`: dedicated SautiLink Base Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY`: browser-safe publishable key used only to verify Supabase user tokens.
- `DATABASE_URL`: private server-only PostgreSQL connection string for the **Base** project, with permission to write `public.base_bots` and `base_private.bot_credentials`.
- `BOT_TOKEN_ENCRYPTION_KEY`: 32 cryptographically random bytes, encoded as base64, stored in hosting secret manager.
- `BOT_CONNECT_TEST_USER_IDS`: exactly two distinct Base Auth user UUIDs, stored in Render only. Enabling the endpoint without this allowlist fails startup.

### Implemented safeguards
- The HMAC-IP quota runs before Supabase Auth, and the per-account quota runs before Telegram verification. A private audit stores outcomes without raw IPs, tokens or messages.
- Only the two configured test accounts may reach token validation, even while the web app is public.
- The restricted Base PostgreSQL role uses verified TLS, and the API binds `owner_id` to a Supabase-verified user, never a browser-supplied field.
- Startup fails before accepting requests if the opt-in is enabled without the dedicated Base public configuration, token-encryption key or IP-HMAC key. `/health/ready` checks the required database privileges when the opt-in is enabled.
- Browser origins are restricted to the reviewed Base Preview and `https://base.sautilink.com`; only the two configured test accounts can connect bots while release gates remain open.

### Remaining release gates
- The real HTTP duplicate request from the second test account returned `This Telegram bot is already connected`; a token-free `already_connected` audit appeared, while the bot and credential counts stayed at one each. The owner confirmed password sign-in after sign-out and dashboard refresh. Both the fixture RLS probe and real-bot owner/other-account read check passed. The live `telegram_bot_id` unique constraint rejected a duplicate insert with `ON CONFLICT DO NOTHING` (zero rows returned). A separate bot-plus-credential transaction was rolled back and left the original counts at one each.
- A live request from the signed-in dashboard using a synthetic, non-secret token with valid syntax returned `Invalid bot token`; one token-free `invalid_token` audit appeared and bot/credential counts remained one each. Mocked Telegram responses cover network failure, HTTP 429/503, malformed JSON, invalid identity and success. Provider failures map to `Telegram validation unavailable` (HTTP 502) without including the token. A real Telegram outage was not induced; monitor this path during operations.
- Add edge-level throttling and operator-approved retention cleanup for private quota/audit rows.
- Implement bot token rotation, disconnection/revocation and lifecycle cleanup.
- Complete production monitoring and review the proxy topology before public use.
- No webhooks or bot activation are performed by this **connection** endpoint.
  Restricted activation and delivery use separate owner-authenticated and
  signed-webhook routes; see `docs/USER_BOT_DELIVERY.md`.
