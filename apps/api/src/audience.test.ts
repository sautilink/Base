import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { audienceCommand, audienceMessageTime, audienceVisitorKey, privateAudienceSender } from './audience';
import { simulateBotMessage } from './simulate-bot';
import { parseCommand } from './bot-config';
import { handleUserBotUpdate, type DeliveryAdapter } from './user-bot-delivery';
import { claimUserBotUpdate } from './user-bot-update-ledger';
import { loadAudienceAnalytics } from './audience-analytics';

const botId = '3d45cfeb-6c0d-42ee-aec7-849e60e66ef0';
const key = Buffer.alloc(32, 7).toString('base64');
const username = 'SampleSupportBot';
const config = { username, welcome_message: 'Welcome', commands: [], rules: [] };
const observation = { visitorKey: 'a'.repeat(64), kind: 'message' as const, action: 'subscribe' as const, actionAt: 1700000000 };

test('audience pseudonyms are stable within a bot and isolated across bots and keys', () => {
  const digest = audienceVisitorKey(botId, 123, key);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, audienceVisitorKey(botId.toUpperCase(),123,key));
  assert.notEqual(digest, audienceVisitorKey('4d45cfeb-6c0d-42ee-aec7-849e60e66ef0',123,key));
  assert.notEqual(digest, audienceVisitorKey(botId,124,key));
  assert.notEqual(digest, audienceVisitorKey(botId,123,Buffer.alloc(32,8).toString('base64')));
  assert.throws(() => audienceVisitorKey(botId,-1,key));
  assert.throws(() => audienceVisitorKey(botId,123,undefined));
});

test('subscription preferences require an explicit command directed at this bot', () => {
  assert.equal(audienceCommand('/SUBSCRIBE@SampleSupportBot',username),'subscribe');
  assert.equal(audienceCommand('/unsubscribe',username),'unsubscribe');
  for (const text of ['/start','subscribe','/subscribe@OtherSupportBot','/subscribe now','/unsubscribe_extra']) assert.equal(audienceCommand(text,username),null);
  assert.equal(simulateBotMessage('/subscribe',config).matchType,'subscription');
  assert.match(simulateBotMessage('/unsubscribe',config).responseText!,/can still use/);
  assert.throws(() => parseCommand({command:'/subscribe',responseText:'Join'}));
  assert.throws(() => parseCommand({command:'/unsubscribe',responseText:'Stay'}));
});

test('only a real private sender matching the chat is eligible for analytics', () => {
  const body = {message:{chat:{id:123,type:'private'},from:{id:123,is_bot:false},text:'/start'}};
  assert.equal(privateAudienceSender(body),123);
  assert.equal(privateAudienceSender({message:{...body.message,from:{id:124,is_bot:false}}}),null);
  assert.equal(privateAudienceSender({message:{...body.message,from:{id:123,is_bot:true}}}),null);
  assert.equal(privateAudienceSender({message:{...body.message,from:undefined}}),null);
  assert.equal(privateAudienceSender({message:{...body.message,chat:{id:123,type:'group'}}}),null);
});

test('consent requires a Telegram message timestamp and rejects future or malformed dates', () => {
  assert.equal(audienceMessageTime({message:{date:1700000000}},1700000000000),1700000000);
  assert.equal(audienceMessageTime({message:{date:1700000301}},1700000000000),null);
  for (const date of [undefined,'1700000000',NaN,-1,0,1.2]) assert.equal(audienceMessageTime({message:{date}}),null);
});

function fakeDatabase(duplicate = false, failActivity = false) {
  const calls: string[] = []; let released = false;
  const db = {
    async connect() { return {
      async query(sql: string) {
        calls.push(sql);
        if (sql.includes('bot_activity_daily') && failActivity) throw new Error('activity write unavailable');
        return { rowCount: sql.includes('user_bot_update_ledger') && duplicate ? 0 : 1, rows: [] };
      },
      release() { released = true; }
    }; }
  } as unknown as Pick<Pool,'connect'|'query'>;
  return { db, calls, released: () => released };
}

test('duplicate claims do not mutate consent or count a second interaction', async () => {
  const f = fakeDatabase(true);
  assert.equal(await claimUserBotUpdate(botId,77,observation,f.db),false);
  assert.equal(f.calls.filter(s => /bot_audience|bot_activity_daily/.test(s)).length,0);
  assert.equal(f.calls.at(-1),'COMMIT'); assert.ok(f.released());
});

test('audience and ledger claim roll back together when an activity write fails', async () => {
  const f = fakeDatabase(false,true);
  await assert.rejects(claimUserBotUpdate(botId,77,observation,f.db),/activity write unavailable/);
  assert.equal(f.calls.at(-1),'ROLLBACK'); assert.ok(!f.calls.includes('COMMIT')); assert.ok(f.released());
  const ok = fakeDatabase();
  assert.equal(await claimUserBotUpdate(botId,77,observation,ok.db),true);
  assert.equal(ok.calls.at(-1),'COMMIT'); assert.ok(ok.released());
});

test('unmatched private text counts as usage and explicit unsubscribe survives an ambiguous reply', async () => {
  const observed: unknown[] = [], sends: string[] = [], states: string[] = [];
  const adapter: DeliveryAdapter = {
    async loadBot() { return {id:botId,status:'active',...config}; },
    async loadRules() { return config; }, async activeToken() { return 'synthetic'; },
    visitorKey: () => observation.visitorKey,
    async claim(_id,_update,obs) { observed.push(obs); return true; },
    async complete(_id,_update,state) { states.push(state); },
    async send(_token,_chat,text) { sends.push(text); throw new Error('ambiguous send'); }
  };
  const message = (text:string) => ({message:{chat:{id:123,type:'private'},from:{id:123,is_bot:false},date:1700000000,text}});
  await handleUserBotUpdate(botId,77,message('unmatched text'),adapter);
  await handleUserBotUpdate(botId,78,message('/unsubscribe'),adapter);
  assert.deepEqual(observed,[{...observation,action:null,actionAt:null},{...observation,action:'unsubscribe'}]);
  assert.equal(sends.length,1); assert.deepEqual(states,['ignored','unknown']);
});

test('analytics passes the verified owner into its SQL snapshot and returns no result for a foreign bot', async () => {
  let params: unknown; const owner = '4d45cfeb-6c0d-42ee-aec7-849e60e66ef0';
  const db = { async query(_sql:string,values:unknown) { params=values; return {rows:[]}; } } as unknown as Pick<Pool,'query'>;
  assert.equal(await loadAudienceAnalytics(db,botId,owner),null);
  assert.deepEqual(params,[botId,owner]);
});
