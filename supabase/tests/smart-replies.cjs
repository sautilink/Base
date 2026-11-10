// Run with a disposable PGlite instance and compiled Base API.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PGlite } = require(process.argv[2]);
const auth = require('../../apps/api/dist/auth-db');
const { botAccessDependencies } = require('../../apps/api/dist/bot-access');
const { SmartRepliesController } = require('../../apps/api/dist/smart-replies.controller');
const { checkSmartRepliesSchema, useSmartReply, smartReplyNotice, smartReplyNoMatch } = require('../../apps/api/dist/smart-replies');
const { handleUserBotUpdate } = require('../../apps/api/dist/user-bot-delivery');
const id = number => '00000000-0000-4000-8000-' + String(number).padStart(12, '0');
const [bot, other, owner, editor] = [1, 2, 3, 4].map(id);
Object.assign(process.env, {
  BASE_AI_SCHEMA_READY: 'true', BASE_AI_BOT_IDS: bot + ',' + other, OPENAI_API_KEY: 'synthetic',
});

async function run() {
  const db = new PGlite();
  try {
    await db.exec(`create schema base_private;
      create role base_api_runtime; create role anon; create role authenticated; create role service_role;
      create table public.base_bots (id uuid primary key, owner_id uuid not null);
      create table public.base_bot_members (bot_id uuid, member_id uuid, role text, status text);
      grant usage on schema base_private to base_api_runtime;
      grant select on public.base_bots, public.base_bot_members to base_api_runtime;`);
    await db.exec(readFileSync(join(__dirname, '../migrations/20261110101439_base_smart_replies.sql'), 'utf8'));
    await db.query('insert into public.base_bots values ($1,$3),($2,$3)', [bot, other, owner]);
    await db.query("insert into public.base_bot_members values ($1,$2,'editor','active')", [bot, editor]);
    await db.exec('set role base_api_runtime');
    const query = async (sql, values) => {
      const result = await db.query(sql, values);
      return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
    };
    auth.pool = botAccessDependencies.pool = () => ({ query });
    botAccessDependencies.verifiedUserId = async identity => identity;
    let calls = 0;
    let topic = 1;
    global.fetch = async (url, request) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const payload = JSON.parse(request.body);
      assert.equal(payload.store, false);
      assert.equal(payload.tools, undefined);
      const input = JSON.parse(payload.input);
      assert.deepEqual(Object.keys(input), ['question', 'topics']);
      assert.deepEqual(input.topics, [{ topic: 1, label: 'Saa za kufunga' }]);
      assert.ok(!request.body.includes('Tunafunga saa kumi na mbili'));
      return Response.json({ status: 'completed', output: [
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ topic }) }] },
      ] });
    };

    await checkSmartRepliesSchema();
    const api = new SmartRepliesController();
    const entries = [{ question: 'Saa za kufunga', answer: 'Tunafunga saa kumi na mbili.' }];
    await assert.rejects(api.save(editor, bot, { entries, telegramEnabled: true }), { status: 403 });
    await assert.rejects(api.save(owner, bot, { entries: [...entries, ...entries], telegramEnabled: false }), { status: 400 });
    await api.save(owner, bot, { entries, telegramEnabled: false });
    assert.deepEqual((await api.settings(owner, other)).entries, []);
    assert.equal(await useSmartReply(bot, 'Mnafunga saa ngapi?', true), null);
    assert.equal(calls, 0);
    assert.equal((await api.preview(owner, bot, { question: 'Mnafunga saa ngapi?' })).reply, entries[0].answer);
    await api.save(owner, bot, { entries, telegramEnabled: true });
    assert.equal((await api.settings(owner, bot)).callsToday, 1);

    const sent = [];
    const claimed = new Set();
    const adapter = {
      async loadBot() { return { status: 'active', username: 'SmartBot', welcome_message: '' }; },
      async loadRules() { return { commands: [{ command: 'ping', response_text: 'pong' }], rules: [] }; },
      async activeToken() { return 'synthetic'; },
      async claim(_bot, updateId) {
        if (claimed.has(updateId)) return false;
        claimed.add(updateId);
        return true;
      },
      async complete() {},
      async send(_token, _chat, text) { sent.push(text); },
      smartReply: (target, question) => useSmartReply(target, question, true),
    };
    const message = (text, type = 'private') => ({
      message: { chat: { id: 123, type }, from: { id: 123, is_bot: false }, text },
    });
    await handleUserBotUpdate(bot, 1, message('/ask'), adapter);
    await handleUserBotUpdate(bot, 2, message('Mnafunga saa ngapi?'), adapter);
    await handleUserBotUpdate(bot, 3, message('/ask agree Mnafunga saa ngapi?', 'group'), adapter);
    await handleUserBotUpdate(bot, 4, message('/ask@OtherBot agree Mnafunga saa ngapi?'), adapter);
    assert.equal(calls, 1);
    assert.deepEqual(sent, [smartReplyNotice]);
    await handleUserBotUpdate(bot, 5, message('/ask agree Mnafunga saa ngapi?'), adapter);
    await handleUserBotUpdate(bot, 5, message('/ask agree Mnafunga saa ngapi?'), adapter);
    await handleUserBotUpdate(bot, 6, message('/ping'), adapter);
    assert.equal(calls, 2);
    assert.deepEqual(sent, [smartReplyNotice, entries[0].answer, 'pong']);
    topic = 99;
    assert.equal((await api.preview(owner, bot, { question: 'Unknown?' })).reply, smartReplyNoMatch);
    await query("update base_private.bot_knowledge set calls=29 where bot_id=$1", [bot]);
    const limited = await Promise.all([api.preview(owner, bot, { question: 'One' }), api.preview(owner, bot, { question: 'Two' })]);
    assert.equal(limited.filter(result => result.reply === smartReplyNoMatch).length, 1);
    assert.equal(calls, 4);
    assert.equal((await api.settings(owner, bot)).callsToday, 30);
    console.log('PASS: role scope, private grants, explicit consent, approved answers, duplicate updates and daily quota');
  } finally { await db.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
