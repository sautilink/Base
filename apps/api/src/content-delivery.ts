import { type RichReply } from './content-config';
import { userBotTelegramCall } from './user-bot-telegram';

const PROJECT='https://gtzqirfwghijuzhvrnha.supabase.co';
export function privateMenuCallback(body:unknown): {chatId:number;id:string|null;queryId:string}|null {
  const q=(body as {callback_query?:{id?:unknown;data?:unknown;from?:{id?:unknown;is_bot?:unknown};message?:{chat?:{id?:unknown;type?:unknown}}}}|null)?.callback_query;
  if(!q||typeof q.id!=='string'||q.id.length>256||q.from?.is_bot===true||q.message?.chat?.type!=='private')return null;
  const chatId=q.message.chat.id;
  if(typeof chatId!=='number'||!Number.isSafeInteger(chatId)||chatId<=0||q.from?.id!==chatId||typeof q.data!=='string'||!/^menu:(root|[0-9a-f-]{36})$/i.test(q.data))return null;
  return {chatId,id:q.data==='menu:root'?null:q.data.slice(5),queryId:q.id};
}
export async function signedMediaUrl(path:string,fetcher:typeof fetch=fetch):Promise<string> {
  if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(path))throw new Error('Invalid media path');
  const secret=process.env.BASE_STORAGE_SECRET_KEY;
  if(!secret)throw new Error('Media delivery not configured');
  const response=await fetcher(PROJECT+'/storage/v1/object/sign/base-content/'+path,{
    method:'POST',headers:{apikey:secret,authorization:'Bearer '+secret,'Content-Type':'application/json'},
    body:JSON.stringify({expiresIn:120}),redirect:'error',signal:AbortSignal.timeout(7000)
  });
  if(!response.ok)throw new Error('Media unavailable');
  const data=await response.json() as {signedURL?:unknown};
  if(typeof data.signedURL!=='string'||!data.signedURL.startsWith('/object/sign/base-content/'+path+'?'))throw new Error('Invalid media response');
  return PROJECT+'/storage/v1'+data.signedURL;
}
export async function sendRichReply(token:string,chatId:number,text:string,reply?:RichReply,fetcher:typeof fetch=fetch):Promise<void> {
  const keyboard=reply?.buttons?.length?{reply_markup:{inline_keyboard:reply.buttons.map(b=>[b])}}:{};
  const c=reply?.content;
  if(c&&c.kind!=='text'&&c.storage_path) {
    const url=await signedMediaUrl(c.storage_path,fetcher);
    const method={photo:'sendPhoto',video:'sendVideo',audio:'sendAudio',document:'sendDocument'}[c.kind] as 'sendPhoto'|'sendVideo'|'sendAudio'|'sendDocument';
    try {
      const download=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!download.ok||!download.body)throw new Error();
      const reader=download.body.getReader(),chunks:Uint8Array[]=[];let size=0;
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>10485760){await reader.cancel();throw new Error();}chunks.push(part.value);}
      if(size===0)throw new Error();
      const form=new FormData();form.set('chat_id',String(chatId));form.set('caption',c.body);
      if(reply?.buttons?.length)form.set('reply_markup',JSON.stringify(keyboard.reply_markup));
      const name=c.title.replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,80)||'attachment';
      form.set(c.kind,new Blob(chunks as BlobPart[],{type:download.headers.get('content-type')??'application/octet-stream'}),name+'.'+c.storage_path.split('.').pop());
      const result=await fetcher('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!result.ok||(await result.json() as {ok?:unknown}).ok!==true)throw new Error();
    }catch{throw new Error('Telegram media delivery unavailable');}
  } else await userBotTelegramCall(token,'sendMessage',{chat_id:chatId,text:text||'Choose an option:',link_preview_options:{is_disabled:true},...keyboard},fetcher);
}
