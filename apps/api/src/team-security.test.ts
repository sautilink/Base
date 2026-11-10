import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {botAccess,botAccessDependencies,parseTeamInvite,permits,type BotPermission,type BotRole} from './bot-access';
import {BotConfigController} from './bot-config.controller';
import {ContentController} from './content.controller';
import {BroadcastController} from './broadcast.controller';
import {UserBotLifecycleController} from './user-bot-lifecycle.controller';
import {TeamController} from './team.controller';
import type {Pool} from 'pg';

const bot='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222',owner='33333333-3333-4333-8333-333333333333';
function status(n:number){return (e:unknown)=>!!e&&typeof e==='object'&&'getStatus' in e&&(e as {getStatus:()=>number}).getStatus()===n;}

test('role permissions deny unknown roles and keep ownership and credentials exclusive',()=>{
 const actions:BotPermission[]=['read','edit','operate','team','credential'];
 const expected={owner:[true,true,true,true,true],admin:[true,true,true,false,false],editor:[true,true,false,false,false],viewer:[true,false,false,false,false],unknown:[false,false,false,false,false]};
 for(const [role,permissions] of Object.entries(expected))assert.deepEqual(actions.map(p=>permits(role,p)),permissions,role);
});
test('invitation accepts a named account and explicit supported role, never owner escalation',()=>{
 assert.deepEqual(parseTeamInvite({memberId:actor,role:'viewer',label:' Test '}),{memberId:actor,role:'viewer',label:'Test'});
 for(const body of [null,{}, {memberId:actor,role:'owner',label:'Test'}, {memberId:actor,role:['admin'],label:'Test'}, {memberId:actor,role:'admin',label:' '.repeat(4)}, {memberId:'email@example.com',role:'viewer',label:'Test'}])assert.throws(()=>parseTeamInvite(body),status(400));
});
test('access verifies identity, scopes the query and re-reads membership after revocation',async()=>{
 let role:BotRole|null='editor',reads=0;
 const verify=mock.method(botAccessDependencies,'verifiedUserId',async()=>actor);
 const database=mock.method(botAccessDependencies,'pool',()=>({query:async(sql:string,params:unknown[])=>{
   reads++;assert.deepEqual(params,[bot,actor]);assert.match(sql,/m\.status='active'/);assert.match(sql,/b\.id=\$1/);
   return {rows:role?[{owner_id:owner,role}]:[]};
 }}) as unknown as Pool);
 try{
  assert.deepEqual(await botAccess('Bearer test',bot,'edit'),{owner_id:owner,role:'editor',actorId:actor});
  role='viewer';await assert.rejects(botAccess('Bearer test',bot,'edit'),status(403));
  role=null;await assert.rejects(botAccess('Bearer test',bot,'read'),status(404));assert.equal(reads,3);
 }finally{verify.mock.restore();database.mock.restore();}
});
test('every mutating controller rejects viewer, editor and admin actions beyond their role before writes',async()=>{
 let role:BotRole='viewer';let reads=0;
 const verify=mock.method(botAccessDependencies,'verifiedUserId',async()=>actor);
 const database=mock.method(botAccessDependencies,'pool',()=>({query:async()=>{reads++;return{rows:[{owner_id:owner,role}]};}}) as unknown as Pool);
 const oldDelivery=process.env.USER_BOT_DELIVERY_ENABLED;process.env.USER_BOT_DELIVERY_ENABLED='true';
 const config=new BotConfigController(),content=new ContentController(),broadcast=new BroadcastController(),lifecycle=new UserBotLifecycleController(),team=new TeamController();
 try{
  const edits=[()=>config.welcome('Bearer test',bot,{}),()=>config.createCommand('Bearer test',bot,{}),()=>config.updateCommand('Bearer test',bot,actor,{}),()=>config.removeCommand('Bearer test',bot,actor),()=>config.createRule('Bearer test',bot,{}),()=>config.updateRule('Bearer test',bot,actor,{}),()=>config.toggleRule('Bearer test',bot,actor,{}),()=>config.removeRule('Bearer test',bot,actor),()=>content.create('Bearer test',bot,{}),()=>content.edit('Bearer test',bot,actor,{}),()=>content.archive('Bearer test',bot,actor),()=>content.restore('Bearer test',bot,actor),()=>content.command('Bearer test',bot,actor,{}),()=>content.menu('Bearer test',bot,{}),()=>content.updateMenu('Bearer test',bot,actor,{}),()=>content.remove('Bearer test',bot,actor)];
  for(const run of edits)await assert.rejects(run(),status(403));
  role='editor';
  for(const run of [()=>broadcast.create('Bearer test',bot,{}),()=>broadcast.edit('Bearer test',bot,actor,{}),()=>broadcast.queue('Bearer test',bot,actor,{}),()=>broadcast.cancel('Bearer test',bot,actor),()=>lifecycle.activate('Bearer test',bot),()=>lifecycle.deactivate('Bearer test',bot),()=>content.enableMenus('Bearer test',bot)])await assert.rejects(run(),status(403));
  role='admin';
  for(const run of [()=>lifecycle.rotateToken('Bearer test',bot,{}),()=>team.list('Bearer test',bot),()=>team.invite('Bearer test',bot,{}),()=>team.change('Bearer test',bot,actor,{}),()=>team.revoke('Bearer test',bot,actor)])await assert.rejects(run(),status(403));
  assert.equal(reads,edits.length+12);
 }finally{verify.mock.restore();database.mock.restore();if(oldDelivery===undefined)delete process.env.USER_BOT_DELIVERY_ENABLED;else process.env.USER_BOT_DELIVERY_ENABLED=oldDelivery;}
});
