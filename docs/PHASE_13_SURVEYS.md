# Phase 13 — Telegram surveys

The first Forms & Surveys release supports one open, single-question survey per bot. An Owner or Admin reviews two to six distinct choices and publishes it. People open the question with `/survey` in private Telegram chat. Selecting a button records one vote per Telegram account per survey. Closing immediately blocks new votes while retaining totals.

The dashboard shows only per-choice totals. Voter keys are scoped to the survey and derived with a server key. The survey tables store no Telegram chat IDs, names or handles. Telegram update claims and votes commit together. The existing authenticated scheduler removes surveys and their votes 30 days after publication.

After API compilation, run `node supabase/tests/surveys.cjs <absolute path to PGlite dist/index.cjs>` with PGlite 0.3.14. This verifies the migration, private grants, publication review, role and bot isolation, Telegram command and callback routing, one vote per account, closure and cleanup with a disposable database.

For the pilot, apply `20261109212640_base_surveys.sql` to the Base Supabase project after approval. Set `BASE_SURVEY_SCHEMA_READY=true` and put only the reviewed test bot in `BASE_SURVEY_BOT_IDS` on the Base API. The existing delivery and scheduler must be running. Then publish a test survey, use `/survey`, vote twice, confirm one vote on the dashboard, close the survey and test the old button.
