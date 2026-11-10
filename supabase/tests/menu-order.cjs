// Run against a disposable PGlite database with the compiled Base API.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PGlite } = require(process.argv[2]);
const auth = require('../../apps/api/dist/auth-db');
const { botAccessDependencies } = require('../../apps/api/dist/bot-access');
const { ContentController } = require('../../apps/api/dist/content.controller');
const { menuReply } = require('../../apps/api/dist/content-config');

const id = number => '00000000-0000-4000-8000-' + String(number).padStart(12, '0');
const [bot, other, owner, editor, viewer, first, second, child, foreign] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(id);

async function run() {
  const db = new PGlite();
  try {
    await db.exec(`create schema base_private;
      create role authenticated; create role base_api_runtime;
      create table public.base_bots(id uuid primary key, owner_id uuid not null);
      create table public.base_bot_members(bot_id uuid, member_id uuid, role text, status text);
      create table public.base_menu_items(id uuid primary key default gen_random_uuid(), bot_id uuid not null references base_bots(id),
        parent_id uuid references base_menu_items(id) on delete cascade, title text not null, response_text text not null default '',
        content_id uuid, url text, position int not null check(position between 0 and 999));
      grant usage on schema base_private to base_api_runtime;
      grant select on public.base_bots, public.base_bot_members to base_api_runtime;
      grant select,insert,update,delete on public.base_menu_items to base_api_runtime;`);
    const migration = readFileSync(join(__dirname, '../migrations/20261102025744_base_content_and_menus.sql'), 'utf8');
    const start = migration.indexOf('create function base_private.validate_menu_tree');
    const end = migration.indexOf('create function base_private.validate_content_link');
    assert.ok(start >= 0 && end > start);
    await db.exec(migration.slice(start, end));
    await db.query('insert into public.base_bots values ($1,$3),($2,$3)', [bot, other, owner]);
    await db.query("insert into public.base_bot_members values ($1,$2,'editor','active'),($1,$3,'viewer','active')", [bot, editor, viewer]);
    await db.exec('set role base_api_runtime');
    await db.query(`insert into public.base_menu_items(id,bot_id,parent_id,title,response_text,url,position) values
      ($1,$5,null,'Products','Product list',null,8),($2,$5,null,'Website','','https://example.com/',8),
      ($3,$5,$1,'Details','Unchanged child',null,5),($4,$6,null,'Foreign','',null,0)`, [first, second, child, foreign, bot, other]);
    const query = async (sql, values) => {
      const result = await db.query(sql, values);
      return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
    };
    auth.pool = botAccessDependencies.pool = () => ({ query, connect: async () => ({ query, release() {} }) });
    botAccessDependencies.verifiedUserId = async identity => identity;
    const api = new ContentController();
    const input = { parentId: null, previous: [first, second], order: [second, first] };
    await assert.rejects(api.reorderMenus(viewer, bot, input), { status: 403 });
    await assert.rejects(api.reorderMenus(editor, bot, { ...input, order: [first, first] }), { status: 400 });
    await assert.rejects(api.reorderMenus(editor, bot, { ...input, previous: [first, child], order: [child, first] }), { status: 409 });
    await assert.rejects(api.reorderMenus(editor, bot, { ...input, previous: [first, foreign], order: [foreign, first] }), { status: 409 });
    assert.deepEqual(await api.reorderMenus(editor, bot, input), { saved: true });
    await assert.rejects(api.reorderMenus(owner, bot, input), { status: 409 });
    const { rows } = await query('select * from public.base_menu_items where bot_id=$1 order by position,id', [bot]);
    assert.deepEqual(rows.map(row => [row.id, row.parent_id, row.position]), [
      [second, null, 0], [first, null, 1], [child, first, 5],
    ]);
    assert.deepEqual(menuReply(null, rows, []).buttons, [
      { text: 'Website', url: 'https://example.com/' }, { text: 'Products', callback_data: 'menu:' + first },
    ]);
    assert.equal(menuReply(child, rows, []).responseText, 'Unchanged child');
    const added = await api.menu(owner, bot, { title: 'New item', responseText: 'New', position: 9 });
    await assert.rejects(api.reorderMenus(owner, bot, { parentId: null, previous: [second, first], order: [first, second] }), { status: 409 });
    await api.remove(owner, bot, added.id);
    assert.deepEqual(await api.reorderMenus(owner, bot, { parentId: null, previous: [second, first], order: [first, second] }), { saved: true });
    console.log('PASS: role, sibling scope, old positions, stale writes, Telegram order and nested links');
  } finally { await db.close(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
