# Cloudflare Worker Preview — SautiLink Base Web

Repository: `sautilink/Base`. Existing Worker: `sautilink-base-web`.
Work on `feat/phase-1-foundation`, with PR #1 left in draft. `main` is
intentionally empty and remains the production branch. Do not merge or deploy
production to test this Preview. Do not change SautiLink App infrastructure.

## Workers Builds settings

Open the existing Worker's **Settings → Builds → Previews Base** tab. The
Builds section has separate **Production** and **Previews Base** tabs; feature
branch commands and build variables must be saved under **Previews Base**.
Use the settings below there and leave Production settings unchanged. This
file documents the intended settings; it does not apply dashboard changes.
Use one working directory for installation, build, and Preview: repository root.

| Setting | Value |
| --- | --- |
| Git repository | `sautilink/Base` |
| Root directory | `/` (repository root) |
| Production branch | `main` — leave unchanged |
| Preview branch | Include `feat/phase-1-foundation` in preview builds |
| Build command | `pnpm install --frozen-lockfile && pnpm run build:cloudflare` |
| Preview command | `pnpm run deploy:preview:cloudflare` |
| Build variable | `SKIP_DEPENDENCY_INSTALL=1` |
| Build variable | `PNPM_VERSION=9.15.4` |
| Build variable | `NODE_VERSION=22` |

Leave the production Deploy command unchanged for this investigation; never run
it to validate the feature branch. The explicit frozen install above replaces
Cloudflare's automatic install. Both root scripts select `@base/web`, so the
installed OpenNext and Wrangler binaries run in `apps/web` beside
`wrangler.jsonc`. Do not add `cd apps/web` or use an app-root setting with these
root commands.

The root `pnpm-lock.yaml` is required and is committed. Cloudflare uses a
lockfile to select its automatic installer; `packageManager` alone only pins
the tool version. The earlier branch had no lockfile, and the supplied logs
showed Bun installing followed immediately by `npx wrangler preview`, with no
OpenNext build. Changing Wrangler's version alone cannot fix that sequence.

After editing fields, click **Save** in the bottom **Unsaved changes** bar and
wait for saving to complete and the bar to disappear. Reload the page, reopen
**Settings → Builds → Previews Base**, and verify both commands and all three
build variables. Editor values alone do not prove the settings were saved;
values under Production do not verify the feature branch's configuration.
The specific build's configuration snapshot and logs show what it actually
used. Check its repository, branch, and commit SHA as well.

## Local verification without uploading

Use pnpm 9.15.4 and Node 22 (the CI versions), from repository root:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm --filter @base/api test
pnpm run build:cloudflare
pnpm --filter @base/web exec wrangler deploy --dry-run
pnpm run deploy:preview:cloudflare --help
```

The dry run bundles the Worker without deploying it. `--help` verifies the
remote Preview command can resolve Wrangler without creating a Preview.
CI also builds the workspace, builds OpenNext, and bundles the Worker in a dry
run. None of those checks proves a remote Preview was published.

`pnpm run deploy:preview:cloudflare` runs **`wrangler preview`**, which creates or
updates the isolated branch Worker Preview. It requires project Wrangler
4.135.0 or later; the lockfile fixes the tested version. Run it without `--help`
only when intentionally publishing the branch Preview, or let Workers Builds
run it. `pnpm --filter @base/web preview:cloudflare` instead runs OpenNext's
**local** development server. `opennextjs-cloudflare upload` uploads a Worker
version and is not a replacement for Worker Previews.

The existing `previews: {}` opts into Worker Previews. Assets, compatibility
date, and compatibility flags stay at the top level of `wrangler.jsonc`.
No duplicate Worker, route, custom domain, or database is required.

## Build variables for the web app

For the feature branch, save public client build settings under
**Settings → Builds → Previews Base**. They must be available during the
Next.js build:

- `NEXT_PUBLIC_SUPABASE_URL`: `https://gtzqirfwghijuzhvrnha.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Base project's publishable key
- `NEXT_PUBLIC_BASE_API_URL`: separate Base HTTPS API origin, once available

The landing page can compile without these settings; that does not verify
sign-in or API connectivity. Never use SautiLink App secrets, a service-role
key, database credentials, bot tokens, or encryption keys in the frontend.

`base.sautilink.com` is the intended production domain. Use the separate URL
returned by the branch Preview to verify this change. Do not attach or move a
domain merely to resolve an install/build failure.

## Verify the next remote build

After saving and rechecking the Preview settings following a reload, retry the
feature build or trigger a new one through the Git integration. Confirm that
the resulting build uses `feat/phase-1-foundation` and the intended commit SHA.
Check its configuration snapshot for the build command, Preview command, root,
and three build variables before checking:

1. The explicit pnpm frozen install succeeds; it does not run `bun install`.
2. `pnpm run build:cloudflare` completes and creates `.open-next/worker.js` and assets.
3. `pnpm run deploy:preview:cloudflare` resolves the web workspace's Wrangler and
   returns a branch Preview URL.
4. That URL serves the landing page and its CSS. Login/API verification is a
   separate check once Base's public build variables and API are configured.

If the log still shows bare `npx wrangler preview`, the intended Preview
command was not used. Treat that build's configuration snapshot and logs as
authoritative, rather than the editor's current field values. Check the commit
SHA and repeat the Save, completion, and reload verification above. An old
snapshot alone does not establish whether Retry or a new push is needed; do
not rotate directories, commands, or dependencies on that evidence alone.

If Wrangler says the `previews` block is missing while
`apps/web/wrangler.jsonc` already contains it, check the actual command, working
directory, and loaded config path. A root command may have missed the web
workspace's config. Do not add a duplicate root Wrangler file to hide that
mismatch.

If pnpm reports that no package manifest was found, verify the repository,
branch, and commit SHA checked out by that build. `main` intentionally contains
only the README; `package.json` and `apps/web` are on
`feat/phase-1-foundation`. Select the feature commit for Preview instead of
deploying or merging `main` to resolve this error.

Official references:
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Build image, installer selection, and install override](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Worker Previews configuration](https://developers.cloudflare.com/workers/previews/configuration/)
- [OpenNext CLI: build, local preview, upload, deploy](https://opennext.js.org/cloudflare/cli)
