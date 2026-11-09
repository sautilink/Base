# Phase 12 — Customer Support Inbox

The first Inbox release is a private, text-only pilot. Owner and Admin can read and reply for their bot; Editor and Viewer have no access to support conversations. The API checks current bot membership on every request. The Inbox is hidden until the server explicitly enables it for a reviewed bot.

1. In a private chat, the visitor sends `/support` to see who can read their messages and how long they are kept.
2. `/support agree <question>` opens a conversation. Further private text goes to the support team while the conversation is open. Ordinary slash commands, menu buttons and subscriptions continue through their usual paths.
3. An Owner or Admin opens the conversation, writes a reply and confirms the preview. The dashboard distinguishes Telegram acceptance from an unconfirmed delivery. Rechecking the same send uses the same request ID and does not send again once claimed.
4. `/endsupport` closes the conversation and clears its stored reply destination. Existing history expires seven days from the original start. Closing does not delete messages from Telegram.

Only private text and a bot-specific pseudonym are stored, plus an encrypted destination while the conversation is open. No names, handles, attachments or group messages are copied into the Inbox. Messages and access state are kept in private runtime-only tables. Each conversation allows 60 visitor texts and 40 team replies, with at most five retained conversations per visitor per bot. The dashboard shows the latest 100 conversations. Expired data is immediately hidden by the API and removed in batches by the existing authenticated scheduler. Scheduler downtime can delay physical deletion; normal database backup retention is separate.

An incoming message and its Telegram update claim commit together. An outgoing reply is claimed before the network call; a timeout or interrupted send is never retried automatically. Closing and permission changes block newly admitted requests; a send already in flight may complete.

## Local validation

After compiling the API, run `node supabase/tests/support-inbox.cjs <absolute path to PGlite dist/index.cjs>` with PGlite 0.3.14. This uses a disposable Postgres instance and mocked Telegram. It verifies the migration and runtime privileges, consent, bot and role isolation, revocation, reply confirmation, duplicate and ambiguous sends, closure and expiry cleanup.

## Rollout

- Release the dormant code on the Base feature branch and custom domain. With no new environment settings, it neither queries Inbox tables nor captures Telegram messages.
- After approval, apply `20261109203935_base_support_inbox.sql` to the Base Supabase project only. Verify private grants and the existing scheduler, then set `BASE_SUPPORT_SCHEMA_READY=true` and `BASE_SUPPORT_BOT_IDS` to the reviewed test bot's UUID on Base API. Existing broadcast scheduler and delivery flags must already be enabled; no new secret is required.
- Verify a test visitor can read the notice, open and close the conversation, and receive one reviewed test reply. Confirm the other team roles cannot access the conversation. Keep the pilot restricted until this passes.
- To stop new capture and replies, remove the bot ID from the allowlist. Leave `BASE_SUPPORT_SCHEMA_READY=true` and the scheduler running to expire existing history.
