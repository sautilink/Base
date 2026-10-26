# Cloudflare Workers deployment — SautiLink Base Web

Target existing Worker: `sautilink-base-web`; custom domain: `base.sautilink.com`.

This repository is a pnpm monorepo; **Next.js app and Wrangler config live in `apps/web`**. Use the existing Cloudflare Worker, not Pages, and do not configure the API on this Worker.

## Cloudflare → Workers & Pages → sautilink-base-web → Settings → Build

- GitHub repository: `sautilink/Base`
- Root directory: `apps/web`
- Production branch: `main` (do **not** deploy until this PR is merged and CI is green)
- Build command: `npx @opennextjs/cloudflare build`
- Deploy command: `npx @opennextjs/cloudflare deploy`
- Preview command: `npx @opennextjs/cloudflare upload` (preview versions, not public production)
- Build system: Node 22, pnpm 9.15.4. Ensure workspace packages are installed from repository root.

App uses Cloudflare's OpenNext adapter for Next.js 15. Wrapper config is in `apps/web/wrangler.jsonc`; make sure the Cloudflare build's working directory is `apps/web`.

## Variables (Worker build/deployment)

- `NEXT_PUBLIC_SUPABASE_URL`: `https://gtzqirfwghijuzhvrnha.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: **Base project** publishable key
- `NEXT_PUBLIC_BASE_API_URL`: separate HTTPS API origin, once available

Never put database credentials, BotFather tokens, service-role keys or encryption keys into the frontend Worker. Configure Supabase Auth Site URL and redirect allowlist for `https://base.sautilink.com` and `https://base.sautilink.com/dashboard`.

## Recovery

If Cloudflare install fails in the monorepo, inspect the Workers Build log before changing commands. If the root-directory setting is incompatible with pnpm workspace installation, build from the repository root with `pnpm --filter @base/web ...` instead, adjusting Wrangler cwd. Do not create duplicate Workers or remove the custom domain.

Note: this file documents the intended configuration; external deployment still requires the Cloudflare connection and secrets configured in the Cloudflare dashboard.
