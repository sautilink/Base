'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {getSupabase} from '../../lib/supabase';
type Content={id:string;title:string;kind:string;body:string;storage_path:string|null;archived:boolean};
type Menu={id:string;parent_id:string|null;title:string;response_text:string;content_id:string|null;url:string|null;position:number};
type Button={text:string;callback_data?:string;url?:string};
type Preview={responseText:string|null;content?:Content;buttons?:Button[]};
type Request=<T>(path:string,init?:RequestInit)=>Promise<T>;
const MIME:Record<string,{kind:string;ext:string}>={
 'image/jpeg':{kind:'photo',ext:'jpg'},'image/png':{kind:'photo',ext:'png'},'image/webp':{kind:'photo',ext:'webp'},
 'video/mp4':{kind:'video',ext:'mp4'},'audio/mpeg':{kind:'audio',ext:'mp3'},'audio/ogg':{kind:'audio',ext:'ogg'},'audio/wav':{kind:'audio',ext:'wav'},
 'application/pdf':{kind:'document',ext:'pdf'},'text/plain':{kind:'document',ext:'txt'},'application/vnd.openxmlformats-officedocument.wordprocessingml.document':{kind:'document',ext:'docx'}
};
export default function ContentManager({botId,request,onChanged}:{botId:string;request:Request;onChanged:()=>Promise<void>}) {
 const [content,setContent]=useState<Content[]>([]),[menus,setMenus]=useState<Menu[]>([]),[mediaEnabled,setMediaEnabled]=useState(false);
 const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [title,setTitle]=useState(''),[body,setBody]=useState(''),[file,setFile]=useState<File|null>(null),[editing,setEditing]=useState<Content|null>(null);
 const [bind,setBind]=useState(''),[command,setCommand]=useState('');
 const [menuId,setMenuId]=useState(''),[menuTitle,setMenuTitle]=useState(''),[parent,setParent]=useState(''),[menuContent,setMenuContent]=useState(''),[menuText,setMenuText]=useState(''),[url,setUrl]=useState(''),[position,setPosition]=useState(0);
 const [preview,setPreview]=useState<Preview|null>(null),[mediaUrl,setMediaUrl]=useState('');
 const path='/bots/'+botId+'/builder';
 async function load(){const r=await request<{content:Content[];menus:Menu[];mediaEnabled:boolean}>(path);setContent(r.content);setMenus(r.menus);setMediaEnabled(r.mediaEnabled);}
 useEffect(()=>{void load().catch(()=>setNotice('Could not load content and menus.'));},[botId]);
 async function work(fn:()=>Promise<void>){setBusy(true);setNotice('');try{await fn();await load();await onChanged();}catch(e){setNotice(e instanceof Error?e.message:'Unable to save.');}finally{setBusy(false);}}
 async function saveContent(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;await work(async()=>{
  if(editing){await request(path+'/content/'+editing.id,{method:'PATCH',body:JSON.stringify({title,body})});}
  else {
   let uploadPath:string|null=null;const supabase=await getSupabase();
   const type=file?MIME[file.type]:null;
   if(file&&(!type||file.size<1||file.size>(type.kind==='photo'?5:10)*1024*1024))throw new Error('Use a supported file: images up to 5 MB, other files up to 10 MB.');
   try {
    if(file&&type){const {data,error}=await supabase.auth.getUser();if(error||!data.user)throw new Error('Sign in again.');
     uploadPath=data.user.id+'/'+botId+'/'+crypto.randomUUID()+'.'+type.ext;
     const uploaded=await supabase.storage.from('base-content').upload(uploadPath,file,{contentType:file.type,upsert:false});
     if(uploaded.error)throw new Error('File upload failed. Check file type and size.');
    }
    await request(path+'/content',{method:'POST',body:JSON.stringify({title,body,kind:type?.kind??'text',storagePath:uploadPath,mime:file?.type,bytes:file?.size})});
   }catch(e){if(uploadPath)await supabase.storage.from('base-content').remove([uploadPath]);throw e;}
  }
  setTitle('');setBody('');setFile(null);setEditing(null);form.reset();setNotice('Content saved.');
 });}
 function resetMenu(){setMenuId('');setMenuTitle('');setParent('');setMenuContent('');setMenuText('');setUrl('');setPosition(0);}
 async function saveMenu(e:FormEvent){e.preventDefault();await work(async()=>{
  await request(path+'/menus'+(menuId?'/'+menuId:''),{method:menuId?'PATCH':'POST',body:JSON.stringify({title:menuTitle,parentId:parent||null,contentId:menuContent||null,responseText:menuText,url,position})});resetMenu();setNotice('Menu saved.');
 });}
 async function showPreview(message:string){setBusy(true);setNotice('');setMediaUrl('');try{
  const r=await request<Preview>('/bots/'+botId+'/simulate',{method:'POST',body:JSON.stringify({message})});setPreview(r);
  if(r.content?.storage_path){const s=await getSupabase();const signed=await s.storage.from('base-content').createSignedUrl(r.content.storage_path,120);if(signed.error)throw new Error('Media preview unavailable.');setMediaUrl(signed.data.signedUrl);}
 }catch(e){setNotice(e instanceof Error?e.message:'Preview unavailable.');}finally{setBusy(false);}}
 function tree(parentId:string|null,seen=new Set<string>()):React.ReactNode{return menus.filter(m=>m.parent_id===parentId).map(m=>{
  if(seen.has(m.id))return null;const next=new Set(seen);next.add(m.id);
  return <li key={m.id}><div className="content-row"><strong>{m.title}</strong><span>{m.url?'Link':content.find(c=>c.id===m.content_id)?.title??'Submenu / text'}</span>
   <button type="button" className="secondary" disabled={busy} onClick={()=>{setMenuId(m.id);setMenuTitle(m.title);setParent(m.parent_id??'');setMenuContent(m.content_id??'');setMenuText(m.response_text);setUrl(m.url??'');setPosition(m.position);}}>Edit</button>
   <button type="button" className="danger" disabled={busy} onClick={()=>{if(window.confirm('Delete “'+m.title+'” and its submenus?'))void work(async()=>{await request(path+'/menus/'+m.id,{method:'DELETE'});resetMenu();});}}>Delete</button></div><ul>{tree(m.id,next)}</ul></li>;
 });}
 return <div className="content-builder">
  <div className="builder-section"><h3>Content Manager</h3><p>Create messages and media, then connect them to a command or a menu button.</p>
   <p role="status" aria-live="polite">{notice}</p>
   <div className="content-library">{content.filter(c=>!c.archived).map(c=><article className="content-row" key={c.id}><div><strong>{c.title}</strong><small>{c.kind} · {c.body.slice(0,100)}</small></div>
    <button type="button" className="secondary" disabled={busy} onClick={()=>void showPreview('content:'+c.id)}>Preview</button>
    <button type="button" className="secondary" disabled={busy} onClick={()=>{setEditing(c);setTitle(c.title);setBody(c.body);setFile(null);}}>Edit</button>
    <button type="button" className="secondary" disabled={busy} onClick={()=>void work(async()=>{await request(path+'/content/'+c.id+'/archive',{method:'POST'});setNotice('Content archived.');})}>Archive</button></article>)}</div>
   {content.some(c=>c.archived)&&<details><summary>Archived content</summary>{content.filter(c=>c.archived).map(c=><div className="content-row" key={c.id}><span>{c.title}</span><button className="secondary" disabled={busy} type="button" onClick={()=>void work(async()=>{await request(path+'/content/'+c.id+'/restore',{method:'POST'});})}>Restore</button></div>)}</details>}
   <form onSubmit={saveContent}><h4>{editing?'Edit content':'Create content'}</h4>
    <label htmlFor="content-title">Title</label><input id="content-title" required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/>
    <label htmlFor="content-body">{file||editing?.kind&&editing.kind!=='text'?'Caption':'Message'}</label><textarea id="content-body" rows={4} required={!file&&(!editing||editing.kind==='text')} maxLength={file||editing?.kind&&editing.kind!=='text'?1024:4000} value={body} onChange={e=>setBody(e.target.value)}/>
    {!editing&&<><label htmlFor="content-file">Photo, video, audio or document (optional)</label><input id="content-file" type="file" disabled={!mediaEnabled} accept={Object.keys(MIME).join(',')} onChange={e=>setFile(e.target.files?.[0]??null)}/>
     <small>{mediaEnabled?'Images up to 5 MB. MP4, MP3/OGG/WAV, PDF, TXT and DOCX up to 10 MB. Files stay private in storage.':'Media uploads are being configured. Text content is available.'}</small></>}
    <div className="inline-actions"><button disabled={busy} type="submit">{busy?'Saving…':'Save content'}</button>{editing&&<button className="secondary" type="button" onClick={()=>{setEditing(null);setTitle('');setBody('');}}>Cancel</button>}</div>
   </form>
   <form onSubmit={e=>{e.preventDefault();void work(async()=>{await request(path+'/content/'+bind+'/command',{method:'POST',body:JSON.stringify({command})});setCommand('');setNotice('Command connected to content.');});}}>
    <h4>Connect content to a command</h4><label htmlFor="content-command">Command</label><input id="content-command" required maxLength={33} placeholder="/products" value={command} onChange={e=>setCommand(e.target.value)}/>
    <label htmlFor="command-content">Content</label><select id="command-content" required value={bind} onChange={e=>setBind(e.target.value)}><option value="">Choose content</option>{content.filter(c=>!c.archived).map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select><button disabled={busy} type="submit">Connect command</button>
   </form>
  </div>
  <div className="builder-section"><h3>Menu Builder</h3><p>Menus appear on /start and /menu. Add a parent to create a submenu.</p><button type="button" className="secondary" disabled={busy} onClick={()=>void work(async()=>{await request(path+'/enable-menus',{method:'POST'});setNotice('Menu buttons enabled on Telegram.');})}>Enable buttons on active bot</button><ul className="menu-tree">{tree(null)}</ul>
   <form onSubmit={saveMenu}><h4>{menuId?'Edit button':'Add a button'}</h4>
    <label htmlFor="menu-title">Button label</label><input id="menu-title" required maxLength={64} value={menuTitle} onChange={e=>setMenuTitle(e.target.value)}/>
    <label htmlFor="menu-parent">Parent</label><select id="menu-parent" value={parent} onChange={e=>setParent(e.target.value)}><option value="">Main menu</option>{menus.filter(m=>m.id!==menuId&&!m.url).map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select>
    <label htmlFor="menu-content">Content to show</label><select id="menu-content" value={menuContent} disabled={!!url} onChange={e=>setMenuContent(e.target.value)}><option value="">Text / submenu only</option>{content.filter(c=>!c.archived).map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select>
    <label htmlFor="menu-text">Message (when no content is selected)</label><textarea id="menu-text" rows={2} maxLength={4000} value={menuText} onChange={e=>setMenuText(e.target.value)}/>
    <label htmlFor="menu-url">HTTPS link (optional)</label><input id="menu-url" type="url" maxLength={2048} disabled={!!menuContent} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://"/>
    <label htmlFor="menu-order">Position</label><input id="menu-order" type="number" min={0} max={999} value={position} onChange={e=>setPosition(Number(e.target.value))}/>
    <div className="inline-actions"><button type="submit" disabled={busy}>Save button</button>{menuId&&<button type="button" className="secondary" onClick={resetMenu}>Cancel</button>}</div>
   </form>
   <h4>Interactive preview</h4><button type="button" className="secondary" disabled={busy} onClick={()=>void showPreview('/menu')}>Open main menu preview</button>
   {preview&&<div className="telegram-preview"><p>{preview.responseText}</p>
    {mediaUrl&&(preview.content?.kind==='photo'?<img src={mediaUrl} alt={preview.content.title}/>:preview.content?.kind==='video'?<video src={mediaUrl} controls/>:preview.content?.kind==='audio'?<audio src={mediaUrl} controls/>:<a href={mediaUrl} target="_blank" rel="noreferrer">Open document preview</a>)}
    {preview.buttons?.map((b,i)=>b.url?<a className="preview-button" key={i} href={b.url} target="_blank" rel="noreferrer">{b.text} ↗</a>:<button className="preview-button" key={i} disabled={busy} type="button" onClick={()=>void showPreview(b.callback_data!)}>{b.text}</button>)}
   </div>}
  </div>
 </div>;
}
