import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runBroadcastScheduler} from './broadcast-scheduler.mjs';

test('a Worker without its private scheduler secret performs no network call',async()=>{
  assert.deepEqual(await runBroadcastScheduler({},()=>{throw new Error('must not fetch');}),{disabled:true});
});
test('scheduler sends the key only in a header to the fixed Base API and never retries',async()=>{
  let calls=0;const key='x'.repeat(43);
  await assert.rejects(runBroadcastScheduler({BASE_BROADCAST_DISPATCH_KEY:key},async(url,init)=>{
    calls++;assert.equal(url,'https://sautilink-base-api-staging.onrender.com/internal/broadcasts/dispatch');
    assert.equal(init.headers['x-base-dispatch-key'],key);assert.equal(init.redirect,'manual');assert.equal(init.method,'POST');
    return new Response('private upstream detail',{status:503});
  }),/^Error: Base broadcast dispatcher unavailable$/);
  assert.equal(calls,1);
});

test('scheduler rejects a redirect without forwarding its credential or retrying',async()=>{
  let calls=0;
  await assert.rejects(runBroadcastScheduler({BASE_BROADCAST_DISPATCH_KEY:'x'.repeat(43)},async(url,init)=>{
    calls++;assert.equal(new URL(url).host,'sautilink-base-api-staging.onrender.com');
    assert.equal(init.redirect,'manual');
    return new Response(null,{status:302,headers:{location:'https://unrelated.invalid/collect'}});
  }),/^Error: Base broadcast dispatcher unavailable$/);
  assert.equal(calls,1);
});
