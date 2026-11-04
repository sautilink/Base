# User-bot Telegram delivery (restricted staging)

The separate @SautiLinkBaseBot master route is unchanged. User bots are
registered inactive. The owner configures a welcome message, command or
enabled keyword reply before activating one from the Base dashboard.

## Activation and pause

- `POST /bots/:botId/activate` requires a verified Base Auth session, an
  owner-scoped bot lookup and the existing two-account test allowlist. It
  checks the stored BotFather token against Telegram `getMe`, refuses to
  replace another application's webhook, registers only the fixed Base
  staging URL, then confirms Telegram's webhook URL before marking the bot
  active. The registration uses `allowed_updates: ['message']`, one connection,
  a per-bot secret header and `drop_pending_updates: true`. This discards Telegram
  updates queued while a bot was paused, so they do not receive delayed replies
  after reactivation. Before calling
  Telegram it performs a rolled-back ledger insert/update under the real
  restricted Render database login.
- `POST /bots/:botId/deactivate` marks the bot inactive before asking Telegram
  to remove the Base webhook. If Telegram is unavailable, Base stops replies
  immediately and reports that webhook cleanup needs a retry. A foreign
  webhook URL is never deleted. Owner-authenticated pause and cleanup remain
  available when `USER_BOT_DELIVERY_ENABLED=false`, so an emergency delivery
  shutdown cannot trap an active webhook.
- `USER_BOT_DELIVERY_ENABLED=true` is independent from master-bot webhook
  registration. Startup requires the restricted connection gate and a
  separate 32-byte `USER_BOT_WEBHOOK_SECRET_KEY` (base64) on Render. The key is
  not a browser variable. Rotating it requires re-registering each active
  user-bot webhook so Telegram sends the new secret.

## Incoming updates

- `POST /telegram/bots/:botId` rejects an invalid bot ID or missing/incorrect
  `X-Telegram-Bot-Api-Secret-Token` before reading the database. The secret is
  derived with HMAC-SHA256 from the per-bot ID and the Render-only key.
- Only private human text messages are eligible for replies. The existing
  dashboard simulator selects the welcome message, command or keyword reply;
  the real webhook reads current saved configuration for each update.
- `base_private.user_bot_update_ledger` stores bot ID, Telegram update ID,
  status and time only. A repeated update is acknowledged without a second
  send. An ambiguous Telegram send is marked `unknown` and is not retried
  automatically. Database failures before claiming the update return an
  error so Telegram can retry. No chat ID, message text or token is stored in
  the ledger.
- Encrypted tokens are returned to the server only through two private
  `SECURITY DEFINER` functions after owner or active-status checks. Browser
  roles cannot execute them or read the private ledger or credentials.

## Rollout checks

1. Apply `database/user-bot-delivery.sql` only to the dedicated Base project.
   Confirm private functions, ledger RLS and privileges. Run Supabase security
   and performance advisors.
2. Run API tests, typechecks, web build, GitHub CI and Wrangler dry-run. Deploy
   the feature commit to Render, then verify `/health/ready`.
3. Add the separate webhook signing key to Render, enable the delivery flag,
   and verify readiness again. Never enable master webhook registration as a
   side effect.
4. On the test bot only, save a welcome message, activate, confirm the
   dashboard status and Telegram's webhook destination. Send a private test
   message from Telegram, confirm one visible reply and one `sent` ledger row.
   Repeat the same update only in a controlled test; normal Telegram users
   should not be asked to resend secrets or update IDs.
5. Pause the bot and confirm new messages receive no Base reply. Keep the
   connection and delivery allowlists restricted until monitoring, retention,
   token rotation and recovery are ready for broader access.

Verified on 2026-11-01: schema privileges, CI #123, Render readiness, webhook
401 without secret, `/ping → pong` simulation, activation, active status after
refresh, and a real `pong` observed by the owner in Telegram. The private
ledger recorded one `sent` update. Step 5 remains open; the test bot is active.

The HTTP handler does not implement guaranteed delivery. A crash after claim
but before send can leave a `processing` row and lose that reply. Resolve this
with an outbox and operational recovery before a high-volume release.

Telegram API reference: [setWebhook and secret_token](https://core.telegram.org/bots/api#setwebhook),
[getWebhookInfo](https://core.telegram.org/bots/api#getwebhookinfo),
[sendMessage](https://core.telegram.org/bots/api#sendmessage).
