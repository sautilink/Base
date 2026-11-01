# SautiLink Base — Release handoff

**Checkpoint:** 2026-11-01. This file is deliberately safe for source-control review. Keep operational credentials, private connection details, account IDs and internal runbook secrets out of the repository.

## Workstream / release boundary

- SautiLink Base has an isolated development and deployment track. Never apply changes to the main SautiLink social platform.
- The staging code is on `feat/phase-1-foundation`. The repository's `main` branch is intentionally not the release branch; do not merge without explicit release approval.
- Phase 3, Phase 4 and Phase 5 changes from PR #2, #3 and #4 were reviewed via CI and integrated into the Base staging branch. These PRs being marked merged by GitHub does **not** imply a merge to `main`.
- Keep live bot operations restricted to the existing approved test accounts. Do not pause, disconnect or replace credentials on a working bot during passive checks.

## Implemented

- Owner-scoped Telegram bot configuration, command and keyword replies, simulator, activation/pause and reversible webhook cleanup.
- Server-only encrypted BotFather token handling; token rotation requires a paused bot and verified bot identity.
- At-most-once update handling. Unknown/ambiguous Telegram send outcomes are **not automatically retried**.
- Owner-only delivery-health summary and read-only sanitized Telegram webhook diagnostics. The editor indicates missing, conflicting and cleanup-pending webhook states.
- Phase 5 improves classification of a database failure after a delivery update has been claimed. No guarantee of exactly-once external delivery is claimed.
- A reviewed, manually operated database retention routine can discard only terminal delivery records older than a conservative minimum age. Unresolved delivery states are never automatically deleted; there is no retention cron job.
- Owner-only diagnostics use no-store response headers.

## Release verification

- Phase 5 GitHub CI #140, #143 and #144 passed automated tests, typechecks, web builds and Cloudflare dry-run.
- The dedicated Base staging API completed a successful Phase 5 deployment.
- Only additive changes were made to the separate Base database. Security review, least-privilege checks and temporary synthetic retention testing passed. Temporary fixtures were cleaned up; the previously active user test bot and its encrypted credential remain.
- **Cloudflare frontend publication remains a separate gate.** The recent public-domain and Preview checks responded normally but did **not** yet show the current Phase 5 release marker. Do not infer live frontend publication from CI or API success.
- GitHub staging readiness checks passed the API liveness/readiness, protected-route and CORS steps after the backend release, but the exact frontend release check was still outstanding at the handoff checkpoint.

## Next release gates, in priority order

1. Inspect the correct Base Worker in Cloudflare deployment history. Confirm the current staging branch's latest commit is published and its custom domain serves the Phase 5 release marker. Run the staging readiness workflow again.
2. With genuine signed-in Base accounts, verify the bot owner can read delivery and Telegram webhook diagnostics and a second account cannot read the first owner's bot (expect not-found).
3. Intentionally pause the dedicated Telegram test bot and verify that new private messages no longer receive Base replies. Verify webhook cleanup and reactivation. Do not interrupt a working bot merely to pass an automated check.
4. Test BotFather replacement token only when the test owner deliberately generates a new token and supplies it through the HTTPS dashboard; never share a token in chat or GitHub.
5. Before broad access: design an outbox/recovery queue, edge-level rate limits, backups and documented retention, and complete a manual security/readiness review.

## Operational constraints

- Preserve the current production-like test bot until an intentional manual acceptance test is authorized.
- Keep administrator access, secrets, account identifiers, infrastructure connection details and private failure reports out of public source control.
- Never automatically replay ambiguous Telegram updates; a provider timeout can occur after the message was accepted.
- Never claim a Cloudflare Worker is live based only on a GitHub dry-run build.
- Keep the Base early-access restrictions until the remaining acceptance gates have passed.

Project detail and reviewed checklists: `docs/PHASE_PROGRESS.md`, `docs/PHASE_5_OPERATIONS.md`, `docs/USER_BOT_DELIVERY.md`, `docs/TOKEN_ROTATION.md`, and `docs/DELIVERY_HEALTH.md`.
