# SautiLink Base Cloudflare Worker

`sautilink-base-web` serves `https://base.sautilink.com`. The custom domain is
attached to this Worker. At the owner's request, Cloudflare Production builds
from `feat/phase-1-foundation` while PR #1 remains draft and `main` remains
intentionally empty. This configuration concerns SautiLink Base only; the
separate SautiLink App infrastructure is outside this repository.

## Production build settings

Set these under **Workers & Pages → sautilink-base-web → Settings → Builds →
Production**, then save and reload to confirm persistence:

| Setting | Value |
| --- | --- |
| Repository | `sautilink/Base` |
| Production branch | `feat/phase-1-foundation` |
| Root directory | `/` |
| Build command | `pnpm install --frozen-lockfile && pnpm build:cloudflare` |
| Deploy command | `pnpm --filter @base/web deploy:cloudflare` |
| Build variable | `SKIP_DEPENDENCY_INSTALL=1` |
| Build variable | `PNPM_VERSION=9.15.4` |
| Build variable | `NODE_VERSION=22` |
| Build variable | `NEXT_PUBLIC_BASE_API_URL=https://sautilink-base-api-staging.onrender.com` |
| Build variable | `NEXT_PUBLIC_SUPABASE_URL=https://gtzqirfwghijuzhvrnha.supabase.co` |
| Build variable | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = this Base project's active `sb_publishable_` key |

The public Supabase key is intended for the browser. Never set a service-role
key, database credential, Telegram bot token, or encryption key as a
`NEXT_PUBLIC_` variable. The frozen install uses the root workspace lockfile;
the root build script selects `apps/web`, where `wrangler.jsonc` lives. The
Deploy command publishes the Worker to its existing custom domain.

Supabase Auth **Site URL** is `https://base.sautilink.com`, with
`https://base.sautilink.com/dashboard` in **Redirect URLs**. The old branch
Preview redirect may stay in the allowlist for isolated tests. Browser sessions
are scoped to their URL origin, so signing in on the Preview does not sign in
the custom domain. Sign in once at the custom domain and refresh there.

The separate Base API on Render accepts CORS from the configured `WEB_ORIGIN`
and `https://base.sautilink.com`. Its `BOT_CONNECT_ENABLED` guard remains off
until the bot connection release gates pass. `BASE_DASHBOARD_URL` on Render
should point to `https://base.sautilink.com/dashboard` after the web Worker is
verified, so the master bot opens the same origin.

## Verify a release

1. Confirm CI passed for the feature commit and the Render API deployed it.
2. Confirm the Cloudflare **Production** build used the same feature commit,
   completed OpenNext build and Wrangler deploy, and produced an active version.
3. Open `https://base.sautilink.com/`, `/login`, and `/dashboard` and confirm
   they serve Base rather than the old placeholder.
4. Sign in through an email link opened in the same browser, refresh
   `/dashboard`, and confirm the signed-in view remains. Check a second
   account separately before enabling bot connection.
5. Check `OPTIONS` preflight from the custom domain against the Base API for
   authenticated editor routes. Verify only approved origins are accepted.

Production and branch Preview settings are separate in Cloudflare. An existing
Preview keeps its own build settings; changing **Previews Base** defaults does
not update it. The earlier failed builds ran `npx wrangler preview` from the
repository root or cloned empty `main`, so they did not build the Next.js app.
Use the build's branch, commit SHA, command log, and output as evidence instead
of inferring success from saved settings alone.

References: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
[Worker Previews configuration](https://developers.cloudflare.com/workers/previews/configuration/),
[OpenNext CLI](https://opennext.js.org/cloudflare/cli).
