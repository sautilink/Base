# Phase 6 — Release verification and safe Cloudflare publish fallback

This is an internal Base staging runbook. It includes **no** access keys, database URIs, user identifiers, bot secrets or administrative credentials. `main` and the SautiLink social network are out of scope.

## New protection

1. Browser API calls are restricted to the reviewed Base staging origin. This prevents the frontend from forwarding a signed-in user's Supabase bearer token to a different HTTPS host through a bad `NEXT_PUBLIC_BASE_API_URL`. Unit tests cover deceptive hostnames, URL paths, credentials, and fragments.
2. BotFather input fields are cleared after each HTTP attempt, successful or failed. Bot lifecycle/configuration HTTP responses use `Cache-Control: no-store`.
3. Public web routes provide framing/MIME/referrer/permissions security headers, with small regression tests. The CSP intentionally limits `frame-ancestors`, `base-uri` and `object-src` but does not impose untested script restrictions that would break Next authentication.
4. The owner-only Telegram webhook-health endpoint uses a **10-second bounded cache of sanitized metadata**, not tokens, URLs or chat content. Cache is invalidated after activation, deactivation or credential rotation. This is an efficiency feature for the single staging API instance, NOT a distributed rate limiter.
5. `GET /health/release` returns only the Render commit SHA (if correctly formatted) and public service name. The staging API job verifies that this SHA matches `GITHUB_SHA`. `GET /health` and `GET /health/ready` alone do not prove deployment of a newly reviewed version.
6. GitHub staging readiness now has **independent API and Cloudflare release jobs**; one can be green while the other remains pending/failed. No missing Cloudflare publish is hidden by a passing GitHub build.

## Cloudflare publishing: supported options

**Preferred:** Cloudflare Workers Builds is already linked to `sautilink/Base`. In the Cloudflare dashboard for `sautilink-base-web`, verify Settings > Build > Branch control uses `feat/phase-1-foundation`, and production builds run `pnpm install --frozen-lockfile && pnpm build:cloudflare` then `pnpm --filter @base/web deploy:cloudflare`. Inspect the latest production build and resulting Worker deployment version. The GitHub CI `wrangler deploy --dry-run` step does **not** publish anything.

**Optional fallback:** `.github/workflows/base-web-publish.yml` provides an alternative **GitHub Actions** deploy route, **disabled by default**. It is limited to the existing Base staging branch, performs dependency install, typecheck, tests, OpenNext build, Wrangler deploy, and then checks `base.sautilink.com` for the Phase 6 web marker. It does **not** run for PRs or `main`.

To opt in *after reviewing Cloudflare deployment ownership*, set in the **GitHub repository's Settings**:

- Actions secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`; use a short-lived, account-scoped, least-privilege Workers-edit API token. Do not paste token values into chat, issue comments, YAML, output logs, screenshots or source.
- Optional Actions secret `BASE_SUPABASE_PUBLISHABLE_KEY` (public `sb_publishable_` key only). Without it, the Base frontend obtains public config from its existing server endpoint.
- Repository variable `BASE_WEB_GITHUB_DEPLOY_ENABLED=true`. Until set, the GitHub publish job is skipped and Cloudflare's existing Build integration remains the publisher.
- Set up a protected GitHub Environment `base-web-production` with appropriate reviewers if governance requires; do not turn on two competing automatic publishing systems without deciding which one is authoritative.

The workflow must fail if required Cloudflare secrets are absent; it must never try to deploy the worker using credentials stored in the repository. Do not add a broad GitHub repository write token.

## Verification before broader release

- Final PR CI: typecheck, API tests, browser origin tests, header/redirect tests, Next build and Wrangler dry run.
- Render API: prove exact `/health/release` revision and owner-only route 401 without session; check DB readiness and CORS.
- Cloudflare web: latest Phase 6 release marker `phase-6-reliability-gates` appears in HTML from the canonical custom domain, not only a branch Preview; login and dashboard both serve HTTP 200.
- Real two-account authenticated HTTP acceptance is still needed for owner 200 / other user 404. This cannot be replaced by checking SQL privileges or anonymous 401.
- Real pause/cleanup/re-activation requires deliberate operator action; a bot already handling messages must never be modified just to get green CI.

Do not claim **exactly-once** Telegram delivery. Unknown/stale processing updates are incident diagnostics, not an automatic retry queue.

References: Cloudflare Workers GitHub Actions documentation and Workers Builds branch controls; original settings in `docs/CLOUDFLARE_WORKER.md`.
