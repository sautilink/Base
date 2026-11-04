# Phase 11 — Bot teams

Bot owners can invite an existing approved Base account by its team ID. The recipient sees the invitation in its own dashboard and explicitly accepts or declines it. No email delivery, Telegram identity mapping or public invite link is used. Invitations expire after seven days; at most ten active/pending memberships are allowed per bot. The pilot continues to use the existing two-account allowlist.

| Operation | Owner | Admin | Editor | Viewer |
| --- | --- | --- | --- | --- |
| Read content, simulator, analytics and diagnostics | Yes | Yes | Yes | Yes |
| Edit welcome, commands, keywords, content, menus; upload private media | Yes | Yes | Yes | No |
| Activate/pause, enable Telegram menus, manage broadcasts | Yes | Yes | No | No |
| Invite, change roles, revoke access, read team history | Yes | No | No | No |
| Replace BotFather token | Yes | No | No | No |
| Leave shared bot | N/A | Yes | Yes | Yes |

## Authorization and data model

- `botAccess` verifies the Supabase user and reads current active membership on every API request. It returns the canonical owner ID for existing ownership-bound queries and a separate actor ID. There is no role cache or authorization from user-editable JWT metadata.
- `public.base_bot_members` has a composite foreign key to the bot and owner, a unique bot/member pair, and prohibits owner self-membership. Browser clients may select only their own memberships or memberships of bots they own; all browser membership writes are revoked.
- Team mutations and append-only private audit events commit atomically. Acceptance is conditional on the named recipient, pending state and expiry. Revoke/accept races serialize on the same row. No ownership transfer is provided.
- Shared bot lists come from the verified API. Existing browser bot/command/rule/menu mutation restrictions remain in force. Team content reads and Storage access use membership RLS; uploads are limited to active Admin/Editor memberships and the canonical owner/bot directory. No media update/upsert permission is added. Cleanup is restricted to unreferenced objects.
- Revocation affects new API and Storage requests. Requests already admitted may finish, and previously issued 120-second media preview URLs remain valid until expiry. A previously scheduled campaign is bot-owned and remains scheduled after its author's access is revoked; the owner must cancel it separately.
- Team history shows membership events, not a general content-edit audit log. No chat content, emails, tokens or passwords appear in team records.
- The Mini App uses the same dashboard and role controls after its existing Telegram verification and Base Auth checks.

## Verification and rollout

- Local API suite: 108 tests passed, including denial at each mutating controller for lower roles, no owner escalation, and fresh membership lookup after role change/revocation.
- Existing web/scheduler suite: 7 passed. API compilation, web typecheck and production Next.js build passed.
- Transactional Base SQL test `supabase/tests/bot_teams.sql` passed with the migration inside BEGIN/ROLLBACK: private grants, pending isolation, recipient binding, expired invitation denial, Viewer/Editor media access, overwrite denial and revocation. No fixture survived.
- Migration created by Supabase CLI: `20261103160820_base_bot_teams.sql`. Applied with explicit user approval to project `gtzqirfwghijuzhvrnha` only, including migration history. Immediately afterward there were zero memberships and zero team events. Runtime release verification remains below.
- Publish only `feat/phase-1-foundation`. Verify CI, Render exact SHA and `/health/ready`, then the active Cloudflare production Worker and `phase-11-bot-teams` on `base.sautilink.com`.
- Real two-account invitation/acceptance/role-change/revocation remains an acceptance gate until performed and recorded. Do not silently grant the second account access to the real test bot for a UI test. Use a specific approved invitation, inspect the actual second account, and revoke test access afterward if agreed.

## Next product phase

Customer Support Inbox can build on these per-bot roles, but it needs an explicit message-storage, retention and agent-reply design. It is not enabled by this release.
