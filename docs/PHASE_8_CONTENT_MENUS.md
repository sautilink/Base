# Phase 8 — Content Manager and Menu Builder

Scope: the Base feature branch, dedicated Base database/API and `base.sautilink.com` only.

## Product flow

- Content Manager saves text, photos, MP4 video, MP3/OGG/WAV audio, and PDF/TXT/DOCX documents. Photos are limited to 5 MB and other files to 10 MB. A bot has at most 200 saved content items including archived items.
- Files upload to the private `base-content` bucket under the signed-in owner's ID and bot ID. Storage RLS requires the matching owner and bot. File metadata is verified before a content record is accepted.
- Content can be edited, archived and restored. Linked content must be unlinked before archiving. Archive keeps its file for restoration.
- A saved content item can be connected to a new custom command. Existing text commands remain available; choosing “Replace with text” removes their content link.
- Menu Builder supports content buttons, HTTPS links, submenus, numeric ordering and Back navigation. The database rejects cycles, foreign-bot parents/content, and link buttons with children. Maximum 100 menu items per bot.
- `/start` includes root buttons; `/menu` opens the main menu. When menus exist, `/menu` is reserved for navigation. The interactive preview uses the same reply resolver as Telegram delivery and never sends a Telegram message.
- On an already active bot, “Enable buttons on active bot” safely adds `callback_query` to the owned webhook without pausing or dropping pending messages. Newly activated bots register both message and callback updates.

## Media delivery and secrets

`BASE_STORAGE_SECRET_KEY` is a server-only modern Supabase secret API key for the isolated Base project. It must never be a `NEXT_PUBLIC_` variable or enter logs, source control or browser responses. The owner authorized placing it on the separate Base API.

The engine obtains a short-lived storage URL, downloads at most 10 MB from the fixed Base storage host, then uploads the bytes to Telegram using multipart. This supports document types that Telegram cannot fetch by URL. Signed storage URLs and credentials are not returned in delivery diagnostics. A provider timeout remains an ambiguous outcome and is never automatically retried.

## Verification checkpoint

- API typecheck, web typecheck and 87 API tests passed locally, including malicious media paths, media type/caption bounds, callback sender checks, shared content resolution, multipart delivery and duplicate callback protection.
- Migration `base_content_and_menus` applied only to the Base project. Rolled-back fixtures passed owner/second-account content and menu visibility, cycle rejection, cross-bot content rejection and URL-parent rejection. Runtime grants were inspected without expanding role membership.
- Supabase security advisor reported only the existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- CI #159 passed for `ad0a270`. Render deployment `dep-dbk03lvlk1mc73af4vmg` was live at that exact revision, with ready health and 401 for an unsigned builder request. Cloudflare build `2c8dda8d` published active Worker `84f5949e` at 100% traffic on the custom domain.
- Browser acceptance passed: a small logo image uploaded, metadata saved, its private signed preview rendered, `/base_demo` linked to it, and `Jaribio la Base → Picha ya Base → Back` worked in the simulator. The owned webhook accepted callback updates without pausing or dropping pending updates.
- Actual uploaded-file RLS check passed: its owner could read the Storage row and the second account could not. The owner then confirmed both `/base_demo` media delivery and the nested menu/Back navigation worked in Telegram.
- One demo content item, its `/base_demo` command and two demo menu items remain as editable examples on the approved test bot. They do not replace the existing `/ping` or welcome configuration. Broader access and scale/recovery remain separate gates.

Branding uses the existing SautiLink logo followed by gray “Base” on the web and Mini App.
