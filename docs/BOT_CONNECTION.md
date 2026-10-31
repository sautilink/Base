# User-bot connection API (staging gate OFF)

The existing @SautiLinkBaseBot is a separate, working master bot on staging. The user-bot route remains disabled until the restricted test rollout; do not submit the master token to it. Base Auth has two signed-in accounts and no connected user bots. A rolled-back SQL test showed that each account could read only its own bot, command, reply rule and menu fixture. Real BotFather connection and cross-account API behavior still need testing.

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
- Browser origins are restricted to the reviewed Base Preview and `https://base.sautilink.com`; the endpoint remains disabled while its release gates are open.

### Remaining release gates
- Use the separate test bot to verify owner isolation in the browser and API, duplicate bot rejection, invalid token, Telegram outage and database rollback. The two-account database RLS probe passed and left no rows.
- Add edge-level throttling and operator-approved retention cleanup for private quota/audit rows.
- Implement bot token rotation, disconnection/revocation and lifecycle cleanup.
- Complete production monitoring and review the proxy topology before public use.
- No webhooks or bot activation are performed by this endpoint.
