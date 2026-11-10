// Disposable local Postgres integration test. Pass an installed PGlite entry point.
// Build apps/api first; no live credentials, network calls, or databases are used.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PGlite } = require(process.argv[2]);
const { SupportController } = require('../../apps/api/dist/support.controller');
const { checkSupportSchema, pruneSupport, recordSupport, supportInput } = require('../../apps/api/dist/support-inbox');
const { botAccessDependencies } = require('../../apps/api/dist/bot-access');
const auth = require('../../apps/api/dist/auth-db');
const credential = require('../../apps/api/dist/user-bot-credential');

const bot = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const owner = '00000000-0000-4000-8000-000000000003';
const admin = '00000000-0000-4000-8000-000000000004';
const editor = '00000000-0000-4000-8000-000000000005';
const requestId = '00000000-0000-4000-8000-000000000006';
const key = Buffer.alloc(32, 42).toString('base64');
Object.assign(process.env, {
  USER_BOT_WEBHOOK_SECRET_KEY: key, BOT_TOKEN_ENCRYPTION_KEY: key,
  BASE_SUPPORT_SCHEMA_READY: 'true', BASE_SUPPORT_BOT_IDS: bot + ',' + other,
  BASE_BROADCAST_ENABLED: 'true', USER_BOT_DELIVERY_ENABLED: 'true',
  BASE_BROADCAST_DISPATCH_KEY: 'a'.repeat(43),
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
    await db.exec(readFileSync(join(__dirname, '../migrations/20261109203935_base_support_inbox.sql'), 'utf8'));
    await db.query('insert into public.base_bots values ($1,$3),($2,$3)', [bot, other, owner]);
    await db.query("insert into public.base_bot_members values ($1,$2,'admin','active'),($1,$3,'editor','active')", [bot, admin, editor]);
    await db.exec('set role base_api_runtime');
    const query = async (sql, params) => {
      const result = await db.query(sql, params);
      // node-postgres returns bytea as Buffer; PGlite returns Uint8Array.
      for (const row of result.rows) if (row.destination instanceof Uint8Array) row.destination = Buffer.from(row.destination);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    };
    const client = { query, release() {} };
    auth.pool = botAccessDependencies.pool = () => ({ query, connect: async () => client });
    botAccessDependencies.verifiedUserId = async identity => identity;
    credential.activeBotToken = async () => 'synthetic';
    let attempts = 0;
    let failTelegram = false;
    global.fetch = async (url, init) => {
      attempts++;
      assert.equal(url, 'https://api.telegram.org/botsynthetic/sendMessage');
      assert.equal(JSON.parse(init.body).chat_id, 123);
      if (failTelegram) throw new Error('Synthetic timeout');
      return Response.json({ ok: true, result: { message_id: 1 } });
    };
    const at = Math.floor(Date.now() / 1000);
    const body = { message: { date: at, chat: { type: 'private', id: 123 }, from: { id: 123, is_bot: false } } };
    assert.equal(supportInput(body, '/ping', 'SupportBot'), null);
    assert.equal(supportInput({ message: { ...body.message, from: { id: 456, is_bot: false } } }, 'hi', 'SupportBot'), null);
    assert.equal(supportInput(body, 'late', 'SupportBot', (at + 301) * 1000), null);
    const event = async (id, text) => db.transaction(async tx => recordSupport({
      query: async (sql, params) => {
        const result = await tx.query(sql, params);
        return { ...result, rowCount: result.affectedRows ?? result.rows.length };
      },
    }, bot, id, supportInput(body, text, 'SupportBot')));

    await checkSupportSchema();
    const inbox = new SupportController();
    assert.equal((await event(1, 'Before consent')).consumed, false);
    assert.match((await event(2, '/support')).reply, /seven days/);
    assert.deepEqual((await inbox.list(owner, bot)).threads, []);
    assert.match((await event(3, '/support agree My question')).reply, /support inbox/);
    assert.equal((await event(4, 'Another detail')).consumed, true);
    assert.equal((await event(4, 'Duplicate')).consumed, true);
    const [thread] = (await inbox.list(admin, bot)).threads;
    assert.deepEqual((await inbox.detail(owner, bot, thread.id)).messages.map(m => m.text), ['My question', 'Another detail']);
    await assert.rejects(inbox.detail(owner, other, thread.id), { status: 404 });
    await assert.rejects(inbox.list(editor, bot), { status: 403 });
    const reply = { text: 'We can help', requestId, confirm: true };
    await assert.rejects(inbox.reply(admin, bot, thread.id, { ...reply, confirm: false }), { status: 400 });
    assert.deepEqual(await inbox.reply(admin, bot, thread.id, reply), { status: 'accepted' });
    assert.deepEqual(await inbox.reply(admin, bot, thread.id, reply), { status: 'accepted' });
    failTelegram = true;
    const uncertain = { ...reply, requestId: '00000000-0000-4000-8000-000000000007' };
    assert.deepEqual(await inbox.reply(admin, bot, thread.id, uncertain), { status: 'unknown' });
    assert.deepEqual(await inbox.reply(admin, bot, thread.id, uncertain), { status: 'unknown' });
    assert.equal(attempts, 2);
    await event(6, '/endsupport');
    assert.equal((await event(5, '/support agree Stale consent')).reply, undefined);
    assert.equal((await event(7, 'After close')).consumed, false);
    await assert.rejects(inbox.reply(admin, bot, thread.id, { ...reply, requestId: owner }), { status: 409 });
    await db.exec("reset role; update public.base_bot_members set status='revoked' where role='admin'; set role base_api_runtime");
    await assert.rejects(inbox.list(admin, bot), { status: 404 });
    await query('update base_private.support_threads set expires_at=now() where id=$1', [thread.id]);
    assert.deepEqual((await inbox.list(owner, bot)).threads, []);
    await pruneSupport();
    assert.deepEqual((await query('select id from base_private.support_messages')).rows, []);
    console.log('PASS: migration and private grants, explicit consent, isolation, deduplication, ambiguous send, closure and retention');
  } finally { await db.close(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
