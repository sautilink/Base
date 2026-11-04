import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseContent,parseMenu,menuReply,type Content,type Menu} from './content-config';
import {privateMenuCallback,sendRichReply,signedMediaUrl} from './content-delivery';
import {simulateBotMessage} from './simulate-bot';
import {handleUserBotUpdate,type DeliveryAdapter} from './user-bot-delivery';
const owner='11111111-1111-4111-8111-111111111111',bot='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const path=owner+'/'+bot+'/'+id+'.pdf';
const content:Content={id,title:'Prices',kind:'document',body:'Our prices',storage_path:path,archived:false};
const menu:Menu={id,parent_id:null,title:'Shop',response_text:'Choose a product',content_id:null,url:null,position:0};
test('content rejects cross-owner paths, wrong media types and oversized captions',()=>{
 const good={title:'Prices',kind:'document',body:'PDF',storagePath:path,mime:'application/pdf',bytes:100};
 assert.equal(parseContent(good,owner,bot).storagePath,path);
 assert.throws(()=>parseContent(good,id,bot));
 assert.throws(()=>parseContent({...good,kind:'photo'},owner,bot));
 assert.throws(()=>parseContent({...good,body:'x'.repeat(1025)},owner,bot));
 assert.throws(()=>parseContent({...good,bytes:10485761},owner,bot));
 assert.throws(()=>parseContent({...good,storagePath:owner+'/'+bot+'/../../private'},owner,bot));
});
test('menus reject executable URLs, embedded credentials and invalid parent IDs',()=>{
 const base={title:'Shop',responseText:'',parentId:null,contentId:null,position:0};
 assert.equal(parseMenu({...base,url:'https://example.com/shop'}).url,'https://example.com/shop');
 for(const url of ['javascript:alert(1)','http://example.com','https://user:password@example.com']) assert.throws(()=>parseMenu({...base,url}));
 assert.throws(()=>parseMenu({...base,parentId:'other'}));
 assert.throws(()=>parseMenu({...base,contentId:id,url:'https://example.com'}));
});
test('menu preview and command delivery resolve shared content with deterministic navigation',()=>{
 const child:Menu={...menu,id:owner,parent_id:id,title:'Prices',content_id:id};
 const leaf=menuReply(owner,[menu,child],[content])!;
 assert.equal(leaf.content?.kind,'document');assert.equal(leaf.buttons?.[0].text,'‹ Back');
 assert.equal(menuReply('missing',[menu,child],[content]),null);
 const reply=simulateBotMessage('/prices',{username:'SampleBot',welcome_message:'',rules:[],commands:[{command:'prices',response_text:'',content_id:id}],contents:[content],menus:[menu,child]});
 assert.equal(reply.content?.id,id);
 assert.equal(simulateBotMessage('/start',{username:'SampleBot',welcome_message:'',rules:[],commands:[],menus:[menu]}).buttons?.length,1);
});
test('callback parsing refuses forwarded/group/cross-sender and malformed callback payloads',()=>{
 const q={id:'query',data:'menu:'+id,from:{id:123},message:{chat:{id:123,type:'private'}}};
 assert.equal(privateMenuCallback({callback_query:q})?.id,id);
 assert.equal(privateMenuCallback({callback_query:{...q,from:{id:999}}}),null);
 assert.equal(privateMenuCallback({callback_query:{...q,message:{chat:{id:123,type:'group'}}}}),null);
 assert.equal(privateMenuCallback({callback_query:{...q,data:'menu:../../secret'}}),null);
});
test('private media signs only a fixed bucket path and sends one captioned Telegram request',async()=>{
 const previous=process.env.BASE_STORAGE_SECRET_KEY;process.env.BASE_STORAGE_SECRET_KEY='synthetic-test-key';
 let requests=0;
 try {
  const fetcher:typeof fetch=async(input,init)=>{
   requests++;const url=String(input);
   if(url.includes('/storage/v1/')&&init?.method==='POST'){const body=JSON.parse(String(init.body));assert.ok(url.startsWith('https://gtzqirfwghijuzhvrnha.supabase.co/storage/v1/object/sign/base-content/'));assert.equal(body.expiresIn,120);return Response.json({signedURL:'/object/sign/base-content/'+path+'?token=synthetic'});}
   if(url.includes('/storage/v1/'))return new Response('synthetic PDF bytes',{headers:{'Content-Type':'application/pdf'}});
   const form=init?.body as FormData;
   assert.ok(url.endsWith('/sendDocument'));assert.equal(form.get('caption'),'Our prices');assert.equal(JSON.parse(String(form.get('reply_markup'))).inline_keyboard[0][0].text,'Back');assert.ok(form.get('document') instanceof Blob);return Response.json({ok:true,result:{message_id:1}});
  };
  await sendRichReply('synthetic-bot-token',123,'Our prices',{responseText:'Our prices',content,buttons:[{text:'Back',callback_data:'menu:root'}]},fetcher);
  assert.equal(requests,3);
  await assert.rejects(signedMediaUrl('https://evil.example/file',fetcher));assert.equal(requests,3);
 }finally{if(previous===undefined)delete process.env.BASE_STORAGE_SECRET_KEY;else process.env.BASE_STORAGE_SECRET_KEY=previous;}
});
test('duplicate callbacks cannot replay content delivery',async()=>{
 let claimed=false,sent=0,acked=0;const states:string[]=[];
 const adapter:DeliveryAdapter={loadBot:async()=>({id:bot,username:'SampleBot',status:'active',welcome_message:''}),loadRules:async()=>({commands:[],rules:[],contents:[content],menus:[{...menu,content_id:id}]}),activeToken:async()=>'synthetic',claim:async()=>{if(claimed)return false;claimed=true;return true;},complete:async(_b,_u,s)=>{states.push(s);},send:async(_t,_c,_s,r)=>{assert.equal(r?.content?.id,id);sent++;},answer:async()=>{acked++;}};
 const update={callback_query:{id:'query',data:'menu:'+id,from:{id:123},message:{chat:{id:123,type:'private'}}}};
 await handleUserBotUpdate(bot,1,update,adapter);await handleUserBotUpdate(bot,1,update,adapter);
 assert.equal(sent,1);assert.equal(acked,1);assert.deepEqual(states,['sent']);
});
