# Bot connection API (development only)

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

### Deployment gates
- Add per-user and per-IP rate limits and audit logging without recording secrets.
- Use scoped PostgreSQL service credentials and TLS verification; do not ship superuser connections.
- Harden origin restrictions and CSRF measures for browser integrations.
- Implement bot token rotation, disconnection/revocation and lifecycle cleanup.
- Enforce max payload size and production monitoring.
- Run integration tests for duplicate bot, invalid token, invalid user, Telegram outage, DB rollback, tenant isolation and encryption decryption.
- No webhooks or bot activation are performed by this endpoint.
