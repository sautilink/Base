# Phase 15 — Smart Replies

Owners and Admins can save up to 20 FAQ pairs for a pilot bot, preview the saved answers and enable the optional Telegram command. A private visitor opens the notice with `/ask` and opts in for a specific question using `/ask agree <question>`. Existing commands, private support conversations and ordinary messages follow their existing paths.

The Responses API receives the question and numbered FAQ topics. Base checks the returned topic number and uses the exact saved answer. Saved answers, Telegram IDs and conversation histories are omitted from the OpenAI request. Requests set `store: false`. Preview and Telegram share a database-enforced limit of 30 matches per bot per UTC day. Telegram only calls the model after the update is claimed.

Local integration uses `node supabase/tests/smart-replies.cjs <absolute path to PGlite dist/index.cjs>` after API compilation. It verifies role access, runtime grants, request contents, explicit Telegram consent, duplicate updates and the daily limit using a fake provider.

For rollout, verify the OpenAI project can run a synthetic Responses request. Apply migration `20261110101439_base_smart_replies.sql` to Base, configure the approved Render service with a server-only `OPENAI_API_KEY`, set `BASE_AI_SCHEMA_READY=true`, and set `BASE_AI_BOT_IDS` to the approved bot's ID. Test a synthetic preview before enabling the Telegram command. Rotate the pilot key before expiry if the pilot is extended.
