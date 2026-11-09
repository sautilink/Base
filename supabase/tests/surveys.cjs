// Run against a disposable PGlite database with the compiled Base API.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PGlite } = require(process.argv[2]);
const auth = require('../../apps/api/dist/auth-db');
const { botAccessDependencies } = require('../../apps/api/dist/bot-access');
const { SurveysController } = require('../../apps/api/dist/surveys.controller');
const { checkSurveySchema, pruneSurveys, recordSurveyVote, surveyReply } = require('../../apps/api/dist/surveys');
const { handleUserBotUpdate } = require('../../apps/api/dist/user-bot-delivery');
const { claimUserBotUpdate } = require('../../apps/api/dist/user-bot-update-ledger');

const id = number => '00000000-0000-4000-8000-' + String(number).padStart(12, '0');
const [bot, other, owner, viewer, surveyId] = [1, 2, 3, 4, 5].map(id);
Object.assign(process.env, {
  USER_BOT_WEBHOOK_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
  BASE_SURVEY_SCHEMA_READY: 'true', BASE_SURVEY_BOT_IDS: bot + ',' + other,
  BASE_BROADCAST_ENABLED: 'true', BASE_BROADCAST_DISPATCH_KEY: 'a'.repeat(43), USER_BOT_DELIVERY_ENABLED: 'true',
});

async function run() {
  const db = new PGlite();
  try {
    await db.exec(`create schema base_private;
      create role base_api_runtime; create role anon; create role authenticated; create role service_role;
      create table public.base_bots (id uuid primary key, owner_id uuid not null);
      create table public.base_bot_members (bot_id uuid, member_id uuid, role text, status text);
      create table base_private.user_bot_update_ledger (bot_id uuid, update_id bigint, status text, primary key(bot_id,update_id));
      grant usage on schema base_private to base_api_runtime;
      grant select, insert on base_private.user_bot_update_ledger to base_api_runtime;
      grant select on public.base_bots, public.base_bot_members to base_api_runtime;`);
    await db.exec(readFileSync(join(__dirname, '../migrations/20261109212640_base_surveys.sql'), 'utf8'));
    await db.query('insert into public.base_bots values ($1,$3),($2,$3)', [bot, other, owner]);
    await db.query("insert into public.base_bot_members values ($1,$2,'viewer','active')", [bot, viewer]);
    await db.exec('set role base_api_runtime');
    const query = async (sql, values) => {
      const result = await db.query(sql, values);
      return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
    };
    const database = { query, connect: async () => ({ query, release() {} }) };
    auth.pool = botAccessDependencies.pool = () => database;
    botAccessDependencies.verifiedUserId = async identity => identity;
    await checkSurveySchema();
    const api = new SurveysController();
    const input = { id: surveyId, question: 'Which day?', choices: ['Monday', 'Friday'], confirm: true };
    await assert.rejects(api.publish(viewer, bot, input), { status: 403 });
    await assert.rejects(api.publish(owner, bot, { ...input, choices: ['Friday', 'friday'] }), { status: 400 });
    await assert.rejects(api.publish(owner, bot, { ...input, confirm: false }), { status: 400 });
    assert.deepEqual(await api.publish(owner, bot, input), { id: surveyId });
    assert.deepEqual(await api.publish(owner, bot, input), { id: surveyId });
    await assert.rejects(api.publish(owner, bot, { ...input, id: id(6) }), { status: 409 });

    const sent = [];
    const answers = [];
    const claimed = new Set();
    const adapter = {
      async loadBot() { return { status: 'active', username: 'SurveyBot', welcome_message: '' }; },
      async loadRules() { return { commands: [{ command: 'ping', response_text: 'pong' }], rules: [] }; },
      async activeToken() { return 'synthetic'; },
      visitorKey() { return 'a'.repeat(64); },
      surveyReply,
      async claim(_bot, updateId) {
        if (claimed.has(updateId)) return false;
        claimed.add(updateId);
        return true;
      },
      async claimSurveyVote(target, updateId, vote) {
        let answer = '';
        const claimed = await claimUserBotUpdate(target, updateId, undefined, database, async tx => {
          answer = await recordSurveyVote(tx, target, vote);
        });
        return { claimed, answer };
      },
      async send(_token, _chat, text, reply) { sent.push({ text, reply }); },
      async answer(_token, _queryId, text) { answers.push(text); },
      async complete() {},
    };
    const chat = (chatId, type = 'private') => ({ id: chatId, type });
    const from = chatId => ({ id: chatId, is_bot: false });
    const msg = text => ({ message: { chat: chat(123), from: from(123), text } });
    const callback = (chatId, data, type) => ({
      callback_query: { id: 'query', data, from: from(chatId), message: { chat: chat(chatId, type) } },
    });
    await handleUserBotUpdate(bot, 1, msg('/survey@SurveyBot'), adapter);
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /^Which day\?/);
    const [first, second] = sent[0].reply.buttons;
    assert.ok(Buffer.byteLength(first.callback_data) <= 64);
    await handleUserBotUpdate(bot, 2, callback(123, first.callback_data), adapter);
    await handleUserBotUpdate(bot, 2, callback(123, first.callback_data), adapter);
    await handleUserBotUpdate(bot, 3, callback(123, second.callback_data), adapter);
    await handleUserBotUpdate(other, 4, callback(123, second.callback_data), adapter);
    await handleUserBotUpdate(bot, 5, callback(124, second.callback_data, 'group'), adapter);
    await handleUserBotUpdate(bot, 6, callback(124, 'vote:' + surveyId + ':6'), adapter);
    assert.deepEqual(answers, [
      'Your vote was recorded.', 'You already voted in this survey.',
      'This survey is closed or unavailable.', 'This survey is closed or unavailable.',
    ]);
    assert.deepEqual((await api.list(viewer, bot)).surveys[0].totals, { 1: 1 });
    assert.deepEqual((await api.list(owner, other)).surveys, []);
    await assert.rejects(api.close(viewer, bot, surveyId, { confirm: true }), { status: 403 });
    await assert.rejects(api.close(owner, other, surveyId, { confirm: true }), { status: 404 });
    await api.close(owner, bot, surveyId, { confirm: true });
    await handleUserBotUpdate(bot, 7, callback(124, second.callback_data), adapter);
    assert.equal(answers.at(-1), 'This survey is closed or unavailable.');
    await assert.rejects(claimUserBotUpdate(bot, 99, undefined, database, async () => { throw new Error('Synthetic rollback'); }));
    assert.equal(await claimUserBotUpdate(bot, 99, undefined, database), true);
    await handleUserBotUpdate(bot, 8, msg('/ping'), adapter);
    assert.equal(sent.at(-1).text, 'pong');
    await db.exec("reset role; update base_private.bot_surveys set expires_at=now(); set role base_api_runtime");
    assert.deepEqual((await api.list(owner, bot)).surveys, []);
    await pruneSurveys();
    assert.deepEqual((await query('select survey_id from base_private.bot_survey_votes')).rows, []);
    console.log('PASS: publication, privacy grants, Telegram vote routing, deduplication, bot isolation, closure and expiry');
  } finally { await db.close(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
