# SautiLink Base Auth setup (development)

1. Create a NEW dedicated Supabase project for Base; never reuse `sautilink` or `sautilink-test`.
2. Review and apply `database/schema.sql` only to the new Base database.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in hosting secrets or local `apps/web/.env.local`; do not commit values.
4. In Supabase Auth URL Configuration, set Site URL to your intended Base domain and allow the exact `/dashboard` redirect URL for development and production.
5. Enable email authentication and configure email delivery/limits appropriate for production.
6. Visit `/login`, request a link, follow it and confirm `/dashboard` displays only owned bots.
7. Test two independent accounts: cross-account read/write access to bots, commands, menus and replies must fail.

This is a **browser-side authentication proof of concept**. Before production, move to SSR-safe cookies/server authorization for privileged operations, protect secrets on the server, configure CORS/CSRF controls, and add automated RLS integration tests.
