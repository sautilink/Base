import assert from 'node:assert/strict';
import {test} from 'node:test';
import {broadcastEnabled,contentFingerprint,decryptDestination,encryptDestination,parseBroadcast,parseBroadcastReview,parseBroadcastSchedule,verifyDispatchKey} from './broadcast-config';
import {dispatchBroadcasts,type BroadcastAdapter,type BroadcastWork} from './broadcast-engine';
import {BroadcastDispatchController} from './broadcast.controller';
import {handleUserBotUpdate,type DeliveryAdapter} from './user-bot-delivery';

const botId='3d45cfeb-6c0d-42ee-aec7-849e60e66ef0', visitorKey='a'.repeat(64);
const key=Buffer.alloc(32,9).toString('base64');
const content={id:botId,title:'Test',kind:'text' as const,body:'Hello',storage_path:null,archived:false};
const work:BroadcastWork={campaignId:botId,botId,visitorKey,consentMessageAt:'1700000000',consentUpdateId:'123',content};

test('destinations are authenticated encrypted and bound to a bot and visitor',()=>{
  const encrypted=encryptDestination(botId,visitorKey,123456789,key);
  assert.equal(decryptDestination(botId,visitorKey,encrypted,key),123456789);
  assert.notDeepEqual(encrypted,encryptDestination(botId,visitorKey,123456789,key));
  assert.ok(!encrypted.includes(Buffer.from('123456789')));
  assert.throws(()=>decryptDestination(botId,'b'.repeat(64),encrypted,key),/unavailable/);
  assert.throws(()=>decryptDestination('4d45cfeb-6c0d-42ee-aec7-849e60e66ef0',visitorKey,encrypted,key),/unavailable/);
  const tampered=Buffer.from(encrypted);tampered[tampered.length-1]^=1;
  assert.throws(()=>decryptDestination(botId,visitorKey,tampered,key),/unavailable/);
  assert.throws(()=>encryptDestination(botId,visitorKey,-1,key));
});

test('scheduling requires explicit confirmation, a bounded UTC time and a reviewed audience',()=>{
  const now=Date.parse('2026-11-02T12:00:00Z');
  assert.equal(parseBroadcastSchedule({confirm:true,sendAt:null},now).getTime(),now);
  assert.equal(parseBroadcastSchedule({confirm:true,sendAt:'2026-11-02T12:01:00Z'},now).toISOString(),'2026-11-02T12:01:00.000Z');
  for(const sendAt of ['2026-11-02T11:59:00Z','2026-12-03T12:00:00Z','2026-11-02T15:00','bad'])assert.throws(()=>parseBroadcastSchedule({confirm:true,sendAt},now));
  assert.throws(()=>parseBroadcastSchedule({confirm:false,sendAt:null},now));
  assert.deepEqual(parseBroadcast({title:' Test ',contentId:botId}),{title:'Test',contentId:botId});
  assert.throws(()=>parseBroadcast({title:'x',contentId:'bad'}));
  assert.equal(parseBroadcastReview({contentHash:'a'.repeat(64),expectedRecipients:200}).total,200);
  for(const total of [0,201,1.2,'1'])assert.throws(()=>parseBroadcastReview({contentHash:'a'.repeat(64),expectedRecipients:total}));
  assert.notEqual(contentFingerprint(content),contentFingerprint({...content,body:'Changed'}));
});

test('dispatcher remains closed unless both delivery flags and its dedicated secret are valid',async()=>{
  assert.equal(broadcastEnabled({BASE_BROADCAST_ENABLED:'true',USER_BOT_DELIVERY_ENABLED:'true',BASE_BROADCAST_DISPATCH_KEY:'x'.repeat(43)}),true);
  assert.equal(broadcastEnabled({BASE_BROADCAST_ENABLED:'true',BASE_BROADCAST_DISPATCH_KEY:'x'.repeat(43)}),false);
  assert.equal(verifyDispatchKey('x'.repeat(43),'x'.repeat(43)),true);
  assert.equal(verifyDispatchKey('y'.repeat(43),'x'.repeat(43)),false);
  const before={...process.env};
  try{
    process.env.BASE_BROADCAST_ENABLED='false';
    await assert.rejects(new BroadcastDispatchController().dispatch(undefined),{status:404});
    process.env.BASE_BROADCAST_ENABLED='true';process.env.USER_BOT_DELIVERY_ENABLED='true';process.env.BASE_BROADCAST_DISPATCH_KEY='x'.repeat(43);
    await assert.rejects(new BroadcastDispatchController().dispatch('wrong'),{status:401});
  }finally{process.env=before;}
});

function fixture(items:Array<BroadcastWork|'skipped'>=[work]) {
  let releaseCount=0,sends=0,claims=0;
  const statuses:string[]=[];
  const adapter:BroadcastAdapter={
    async lock(){return async()=>{releaseCount++;};},
    async claim(){claims++;return items.shift()??null;},
    async eligible(){return true;},async send(){sends++;},
    async complete(_work,status){statuses.push(status);},now:()=>0,delay:async()=>{}
  };
  return{adapter,statuses,releaseCount:()=>releaseCount,sends:()=>sends,claims:()=>claims};
}
test('a concurrent dispatcher without the global lease never claims or sends',async()=>{
  const f=fixture();f.adapter.lock=async()=>null;
  assert.equal((await dispatchBroadcasts(f.adapter)).busy,true);
  assert.equal(f.claims(),0);assert.equal(f.sends(),0);
});
test('opt-out, pause or cancellation immediately before delivery skips the recipient',async()=>{
  const f=fixture();f.adapter.eligible=async()=>false;
  assert.equal((await dispatchBroadcasts(f.adapter)).skipped,1);
  assert.equal(f.sends(),0);assert.deepEqual(f.statuses,['skipped']);assert.equal(f.releaseCount(),1);
});
test('ambiguous sends are recorded unknown and stop the batch without replay',async()=>{
  const f=fixture([work,{...work,campaignId:'4d45cfeb-6c0d-42ee-aec7-849e60e66ef0'}]);
  f.adapter.send=async()=>{throw new Error('ambiguous provider timeout');};
  assert.equal((await dispatchBroadcasts(f.adapter)).unknown,1);
  assert.deepEqual(f.statuses,['unknown']);assert.equal(f.claims(),1);assert.equal(f.releaseCount(),1);
});
test('terminal write failure releases the lease and does not attempt another send',async()=>{
  const f=fixture([work,work]);f.adapter.complete=async()=>{throw new Error('database unavailable');};
  await assert.rejects(dispatchBroadcasts(f.adapter),/database unavailable/);
  assert.equal(f.sends(),1);assert.equal(f.claims(),1);assert.equal(f.releaseCount(),1);
});
test('a dispatch invocation is bounded and throttles each accepted send',async()=>{
  const f=fixture(Array.from({length:20},()=>work));let delays=0;
  f.adapter.delay=async()=>{delays++;};
  assert.equal((await dispatchBroadcasts(f.adapter)).sent,10);assert.equal(delays,10);
  assert.equal(f.releaseCount(),1);
});
test('only explicit subscribe requests capture an encrypted destination',async()=>{
  const observations:unknown[]=[];let encryptions=0;
  const adapter:DeliveryAdapter={
    async loadBot(){return{id:botId,username:'SampleSupportBot',status:'active',welcome_message:'Welcome'};},
    async loadRules(){return{commands:[],rules:[]};},async activeToken(){return'synthetic';},visitorKey:()=>visitorKey,
    destination:()=>{encryptions++;return Buffer.alloc(32,1);},
    async claim(_bot,_id,observation){observations.push(observation);return true;},async complete(){},async send(){}
  };
  for(const [i,text] of ['/start','/subscribe','/unsubscribe'].entries())await handleUserBotUpdate(botId,i,{message:{text,date:1700000000,chat:{id:123,type:'private'},from:{id:123,is_bot:false}}},adapter);
  assert.equal(encryptions,1);
  assert.equal((observations[0] as {destination?:Buffer}).destination,undefined);
  assert.ok(Buffer.isBuffer((observations[1] as {destination:Buffer}).destination));
  assert.equal((observations[2] as {destination?:Buffer}).destination,undefined);
});
