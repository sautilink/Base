'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {getSupabase} from '../../lib/supabase';

type Content={id:string;title:string;kind:string;body:string;storage_path:string|null;archived:boolean};
type Campaign={id:string;title:string;content_id:string;preview:Content|null;status:string;scheduled_at:string|null;total:number;sent:number;unknown:number;skipped:number;remaining:number};
type State={campaigns:Campaign[];eligible:number;subscribers:number;enabled:boolean;schedulerReady:boolean;lastTickAt:string|null};
type Review={campaignId:string;content:Content;contentHash:string;total:number;sendAt:string|null;mediaUrl:string};
type Request=<T>(path:string,init?:RequestInit)=>Promise<T>;

export default function BroadcastCenter({botId,request,revision}:{botId:string;request:Request;revision:unknown}) {
  const [data,setData]=useState<State|null>(null),[contents,setContents]=useState<Content[]>([]);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [title,setTitle]=useState(''),[contentId,setContentId]=useState(''),[editing,setEditing]=useState<string|null>(null);
  const [when,setWhen]=useState(''),[zone,setZone]=useState('local time'),[review,setReview]=useState<Review|null>(null);
  const [cancelId,setCancelId]=useState<string|null>(null);
  const path='/bots/'+botId+'/broadcasts';
  async function load() {
    const [state,library]=await Promise.all([request<State>(path),request<{content:Content[]}>('/bots/'+botId+'/builder')]);
    setData(state);setContents(library.content.filter(c=>!c.archived));
  }
  useEffect(()=>{let active=true;setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);void Promise.all([request<State>(path),request<{content:Content[]}>('/bots/'+botId+'/builder')])
    .then(([state,library])=>{if(active){setData(state);setContents(library.content.filter(c=>!c.archived));}})
    .catch(()=>{if(active)setNotice('Broadcast Center could not load. Try Refresh broadcasts.');});return()=>{active=false;};
    // A content save refreshes the parent config and this library.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[botId,revision]);
  async function work(fn:()=>Promise<void>) {
    setBusy(true);setNotice('');try{await fn();await load();}catch(e){setNotice(e instanceof Error?e.message:'Unable to update broadcast.');}finally{setBusy(false);}
  }
  async function save(e:FormEvent) {e.preventDefault();await work(async()=>{
    await request(path+(editing?'/'+editing:''),{method:editing?'PATCH':'POST',body:JSON.stringify({title,contentId})});
    setTitle('');setContentId('');setEditing(null);setReview(null);setNotice('Draft saved. Nothing has been sent.');
  });}
  async function preview(campaign:Campaign,sendAt:string|null) {await work(async()=>{
    const result=await request<{content:Content;contentHash:string;total:number}>(path+'/'+campaign.id+'/preview');
    let mediaUrl='';
    if(result.content.storage_path){const s=await getSupabase();const signed=await s.storage.from('base-content').createSignedUrl(result.content.storage_path,120);if(signed.error)throw new Error('Media preview unavailable. Try again before confirming.');mediaUrl=signed.data.signedUrl;}
    setReview({...result,campaignId:campaign.id,sendAt,mediaUrl});
  });}
  async function confirm() {if(!review)return;await work(async()=>{
    const result=await request<{total:number}>(path+'/'+review.campaignId+'/queue',{method:'POST',body:JSON.stringify({confirm:true,sendAt:review.sendAt,contentHash:review.contentHash,expectedRecipients:review.total})});
    setReview(null);setNotice('Broadcast queued for '+result.total+' subscribers. Follow delivery progress below.');
  });}
  async function cancel(campaignId:string) {await work(async()=>{
    await request(path+'/'+campaignId+'/cancel',{method:'POST'});
    setCancelId(null);setReview(null);setNotice('Broadcast cancelled.');
  });}
  const selected=contents.find(c=>c.id===contentId);
  return <section className="builder-section" aria-label="Broadcast Center">
    <div className="delivery-health-heading"><div><span className="eyebrow">BROADCASTS</span><h3>Broadcast Center</h3></div>
      <button type="button" className="secondary" disabled={busy} onClick={()=>void work(load)}>Refresh broadcasts</button></div>
    <p>Prepare saved content, review your audience, then send now or choose a time.</p>
    <p role="status" aria-live="polite" className="notice">{notice}</p>
    {data&&<>
      <div className="delivery-health-grid"><div><strong>{data.eligible}</strong><small>Ready to receive broadcasts</small></div><div><strong>{data.subscribers}</strong><small>Subscribed to updates</small></div><div><strong>{data.schedulerReady?'Connected':'Unavailable'}</strong><small>Scheduler</small></div></div>
      {!data.schedulerReady&&<p className="notice">Sending and scheduling are unavailable until the scheduler connects. You can save and preview drafts now.</p>}
      <p className="notice">Visitors must send <code>/subscribe</code> after this update to be ready for broadcasts. <code>/unsubscribe</code> removes their delivery destination. Pilot limits: 200 recipients, one active campaign and three broadcasts per bot per day.</p>
      <form onSubmit={save} className="broadcast-draft"><h4>{editing?'Edit draft':'Create a broadcast draft'}</h4>
        <label htmlFor="broadcast-title">Campaign name</label><input id="broadcast-title" maxLength={100} required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Weekly update"/>
        <label htmlFor="broadcast-content">Saved content</label><select id="broadcast-content" required value={contentId} onChange={e=>setContentId(e.target.value)}><option value="">Choose content</option>{contents.map(c=><option key={c.id} value={c.id}>{c.title} · {c.kind}</option>)}</select>
        {!contents.length&&<p className="notice">Create content in Content Manager below, then refresh broadcasts.</p>}
        {selected&&<p className="broadcast-summary"><strong>{selected.title}</strong><br/>{selected.body}</p>}
        <div className="inline-actions"><button type="submit" disabled={busy||!contentId}>Save draft</button>{editing&&<button type="button" className="secondary" onClick={()=>{setEditing(null);setTitle('');setContentId('');}}>Stop editing</button>}</div>
      </form>
      <div className="broadcast-time"><label htmlFor="broadcast-time">Schedule time · {zone}</label><input id="broadcast-time" type="datetime-local" value={when} onChange={e=>{setWhen(e.target.value);setReview(null);}}/><small>Choose at least one minute ahead, up to 30 days. Dispatch starts on the next scheduler tick; a sleeping service or Telegram delay can make it later.</small></div>
      {review&&<section className="broadcast-review" aria-label="Review broadcast"><h4>Review before sending</h4>
        <p><strong>{review.total} current subscribers</strong> · {review.sendAt?new Date(review.sendAt).toLocaleString()+' ('+zone+')':'Next available dispatch'}</p>
        <div className="telegram-preview"><strong>{review.content.title}</strong><p>{review.content.body}</p>
          {review.mediaUrl&&(review.content.kind==='photo'?<img src={review.mediaUrl} alt={review.content.title}/>:review.content.kind==='video'?<video src={review.mediaUrl} controls/>:review.content.kind==='audio'?<audio src={review.mediaUrl} controls/>:<a href={review.mediaUrl} target="_blank" rel="noreferrer">Open document preview</a>)}
        </div><p className="notice">Content and audience are checked again when you confirm. Opt-outs are checked before each delivery. A Telegram request already in progress cannot be recalled.</p>
        <div className="inline-actions"><button type="button" disabled={busy||!data.schedulerReady||review.total<1||review.total>200} onClick={()=>void confirm()}>{review.sendAt?'Confirm schedule':'Confirm send now'}</button><button className="secondary" type="button" onClick={()=>setReview(null)}>Close review</button></div>
      </section>}
      {!data.campaigns.length&&<p className="notice">No broadcasts yet. Your first draft will appear here.</p>}
      <div className="broadcast-history">{data.campaigns.map(c=><article className="broadcast-campaign" key={c.id}>
        <div className="delivery-health-heading"><strong>{c.title}</strong><span className="pill">{c.status}</span></div>
        {c.scheduled_at&&<p className="notice">Scheduled: {new Date(c.scheduled_at).toLocaleString()} · {zone}</p>}
        {c.status!=='draft'&&<p className="notice">Audience {c.total} · Accepted {c.sent} · Waiting {c.remaining} · Skipped {c.skipped} · Unknown {c.unknown}</p>}
        {c.unknown>0&&<p className="notice" role="alert">Some outcomes are unknown. Telegram may have accepted them; Base will not resend those recipients automatically.</p>}
        <div className="inline-actions">{c.status==='draft'&&<>
          <button type="button" className="secondary" disabled={busy} onClick={()=>{setEditing(c.id);setTitle(c.title);setContentId(c.content_id);setReview(null);}}>Edit draft</button>
          <button type="button" className="secondary" disabled={busy} onClick={()=>void preview(c,null)}>Preview / send now</button>
          <button type="button" className="secondary" disabled={busy||!when} onClick={()=>{const date=new Date(when);if(Number.isFinite(date.getTime()))void preview(c,date.toISOString());else setNotice('Choose a valid schedule time.');}}>Review schedule</button>
        </>}{['draft','scheduled','sending'].includes(c.status)&&<button type="button" className="danger" disabled={busy} onClick={()=>{setCancelId(c.id);setReview(null);}}>Cancel broadcast</button>}</div>
        {cancelId===c.id&&['draft','scheduled','sending'].includes(c.status)&&<section className="broadcast-review" aria-label={'Cancel '+c.title}>
          <h4>Cancel “{c.title}”?</h4>
          <p>Unsent recipients will be skipped. A message already in flight may still arrive. This campaign cannot be resumed after cancellation.</p>
          <div className="inline-actions">
            <button type="button" className="danger" disabled={busy} onClick={()=>void cancel(c.id)}>Confirm cancellation</button>
            <button type="button" className="secondary" disabled={busy} autoFocus onClick={()=>setCancelId(null)}>Keep campaign</button>
          </div>
        </section>}
      </article>)}</div>
      <p className="notice">Accepted counts Telegram API acceptance, not proof that a person read the message. A paused bot waits for reactivation; cancel its campaign to stop it. Campaigns more than 24 hours overdue expire.</p>
    </>}
  </section>;
}
