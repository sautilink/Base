# User-bot connection API (staging gate OFF)

The existing @SautiLinkBaseBot is a separate, working master bot on staging. The user-bot route described below remains disabled with `BOT_CONNECT_ENABLED=false`; do not submit the master token to it. Base Auth had one account and no connected user bots at the last audit, so real cross-account behavior has not yet been tested.

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

### Implemented safeguards
- Durable per-account and HMAC-IP quotas run before Telegram verification; a private audit stores outcomes without raw IPs, tokens or messages.
- The restricted Base PostgreSQL role uses verified TLS, and the API binds `owner_id` to a Supabase-verified user, never a browser-supplied field.
- Startup fails before accepting requests if the opt-in is enabled without the dedicated Base public configuration, token-encryption key or IP-HMAC key. `/health/ready` checks the required database privileges when the opt-in is enabled.
- Browser origins are restricted to the reviewed Base Preview and `https://base.sautilink.com`; the endpoint remains disabled while its release gates are open.

### Remaining release gates
- Test with two genuine Base accounts and a separate test bot. Verify owner isolation in the browser and API, duplicate bot rejection, invalid token, Telegram outage and database rollback.
- Add edge-level throttling and operator-approved retention cleanup for private quota/audit rows.
- Implement bot token rotation, disconnection/revocation and lifecycle cleanup.
- Complete production monitoring and review the proxy topology before public use.
- No webhooks or bot activation are performed by this endpoint.
