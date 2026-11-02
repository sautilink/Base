# Phase 7 — Telegram Mini App entry and verified context

This phase uses the existing Base account and bot builder. It does not create a Telegram-to-Base account link, issue a new login token, or grant access to bots from a Telegram ID alone. `main` and the separate SautiLink App are unchanged.

## User flow

1. In a private chat with @SautiLinkBaseBot, send `/dashboard` and tap **Open SautiLink Base Mini App**. The adjacent browser link remains available.
2. Telegram opens `https://base.sautilink.com/miniapp` with raw signed `tgWebAppData` in the launch fragment. The page reads that value and keeps it in this WebView's session storage for the return from Base sign-in. It does not depend on downloading the Telegram JavaScript SDK, since that host is unreachable in the tested network.
3. The page sends that value only to the fixed Base staging API's `POST /telegram/miniapp/verify`. The API checks Telegram's HMAC-SHA-256 signature using the Base master bot token, rejects duplicate fields, requires a real Telegram user, and limits `auth_date` to ten minutes with one minute of clock skew. It returns only `{ "verified": true }`, with `Cache-Control: no-store`.
4. A separate Supabase Base Auth session is still required to see or edit bots. An existing signed-in session opens the builder. Otherwise, the user signs in with the existing email and password and returns to `/miniapp`. This may require one sign-in inside Telegram's WebView even if the regular browser is already signed in.

Never use `initDataUnsafe` for authorization. Telegram supplies raw initData in its launch fragment; do not add it to app-generated URLs, logs, analytics or public responses. Never expose Telegram bot tokens, Base access tokens, email links or passwords. The Mini App is not a passwordless login mechanism.

## Release order

1. Pass API signature tests, typechecks, web build, Cloudflare dry run and CI on `feat/phase-1-foundation`.
2. Confirm the Cloudflare production build for that exact feature commit and `base.sautilink.com/miniapp` serves the Phase 7 web marker. A direct browser visit must show the safe “Open this Mini App from @SautiLinkBaseBot” state without exposing a dashboard.
3. Deploy the exact commit to the separate Base Render API. Verify `/health/release`, `/health/ready`, and an unsigned `POST /telegram/miniapp/verify` returns 401. The route requires the existing `MASTER_BOT_ENABLED` flag.
4. In Telegram, send `/dashboard` to the Base master bot, open the Mini App button, and verify signed context plus Base account sign-in. Confirm only the owner's bots appear and that a second account still sees none.

No BotFather menu button or Main Mini App setting is changed by this phase. Those can be configured after the inline launch is accepted. The page uses only the signed launch data; optional WebApp window controls are used if Telegram already provides them. The existing two-test-account gate remains on bot connection and delivery.

References: [Telegram Mini Apps](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app), [Telegram launch modes](https://core.telegram.org/bots/webapps#launching-mini-apps).
