'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {baseRequest} from '../../lib/base-request';

type Member={id:string;member_id:string;role:string;label:string;status:string;expires_at:string};
type Event={id:string;action:string;role:string;label:string;created_at:string};
type State={members:Member[];events:Event[]};
const roles=['viewer','editor','admin'];
export default function TeamManager({botId,role,onLeft}:{botId:string;role:string;onLeft:()=>void}) {
 const [data,setData]=useState<State|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [memberId,setMemberId]=useState(''),[label,setLabel]=useState(''),[inviteRole,setInviteRole]=useState('viewer');
 const [review,setReview]=useState<{kind:'invite'|'revoke'|'role'|'leave';member?:Member;role?:string}|null>(null);
 const path='/team/bots/'+botId;
 async function load(){if(role==='owner')setData(await baseRequest<State>(path));}
 useEffect(()=>{void load().catch(e=>setNotice(e.message));},[botId,role]);
 async function confirm(){if(!review)return;setBusy(true);setNotice('');try{
  if(review.kind==='leave'){await baseRequest(path+'/leave',{method:'POST'});onLeft();return;}
  if(review.kind==='invite'){await baseRequest(path+'/invite',{method:'POST',body:JSON.stringify({memberId:memberId.trim(),label,role:inviteRole})});setMemberId('');setLabel('');setNotice('Invitation saved. The invited account must accept it in its Base dashboard.');}
  else if(review.kind==='revoke'){await baseRequest(path+'/members/'+review.member!.id+'/revoke',{method:'POST'});setNotice('Access revoked. New requests from this account will be denied.');}
  else {await baseRequest(path+'/members/'+review.member!.id,{method:'PATCH',body:JSON.stringify({role:review.role})});setNotice('Role updated.');}
  setReview(null);await load();
 }catch(e){setNotice(e instanceof Error?e.message:'Unable to update team.');}finally{setBusy(false);}}
 function invite(e:FormEvent){e.preventDefault();setReview({kind:'invite'});}
 return <section className="builder-section" aria-label="Bot team">
  <div className="delivery-health-heading"><div><span className="eyebrow">TEAM & ACCESS</span><h3>Bot team</h3></div><span className="pill">{role}</span></div>
  <p>Viewer can view content and analytics. Editor can also change replies, content and menus. Admin can also manage delivery and broadcasts. Only the owner manages the team and BotFather token.</p>
  {notice&&<p role="status" className="notice">{notice}</p>}
  {role==='owner'?<>
   <button type="button" className="secondary" disabled={busy} onClick={()=>void load().catch(e=>setNotice(e.message))}>Refresh team</button>
   <form onSubmit={invite}><h4>Invite a teammate</h4><p>Ask your teammate for their Base team ID, shown on their dashboard. Invitations expire after seven days. During this pilot, invite an approved Base test account.</p>
    <label htmlFor="team-member-id">Base team ID</label><input id="team-member-id" required maxLength={36} pattern="[0-9a-fA-F-]{36}" value={memberId} onChange={e=>{setMemberId(e.target.value);setReview(null);}}/>
    <label htmlFor="team-label">Name for this teammate</label><input id="team-label" required maxLength={60} value={label} onChange={e=>{setLabel(e.target.value);setReview(null);}}/>
    <label htmlFor="team-role">Role</label><select id="team-role" value={inviteRole} onChange={e=>{setInviteRole(e.target.value);setReview(null);}}>{roles.map(r=><option key={r} value={r}>{r}</option>)}</select>
    <button disabled={busy} type="submit">Review invitation</button>
   </form>
   {data?.members.map(m=><article className="broadcast-campaign" key={m.id}><strong>{m.label}</strong><p>{m.role} · {m.status}{m.status==='invited'?' · expires '+new Date(m.expires_at).toLocaleDateString():''}</p>
    {m.status==='active'&&<label>Change role for {m.label}<select aria-label={'Role for '+m.label} disabled={busy} value={m.role} onChange={e=>setReview({kind:'role',member:m,role:e.target.value})}>{roles.map(r=><option key={r} value={r}>{r}</option>)}</select></label>}
    {m.status!=='revoked'&&<button type="button" className="danger" disabled={busy} onClick={()=>setReview({kind:'revoke',member:m})}>Revoke {m.label}</button>}
   </article>)}
   {data&&!data.members.length&&<p>No teammates invited yet.</p>}
  </>:<button type="button" className="secondary" disabled={busy} onClick={()=>setReview({kind:'leave'})}>Leave this bot team</button>}
  {review&&<section className="broadcast-review" aria-label="Review team change"><h4>{review.kind==='invite'?'Invite '+label+' as '+inviteRole+'?':review.kind==='revoke'?'Revoke '+review.member?.label+'?':review.kind==='role'?'Change '+review.member?.label+' to '+review.role+'?':'Leave this bot team?'}</h4>
   <p>{review.kind==='invite'?'Only the account matching this Base team ID can accept: '+memberId:review.kind==='role'?'The new permissions apply to the next request.':'New requests will lose access. Work already in progress and temporary media links may finish.'}</p>
   <div className="inline-actions"><button type="button" disabled={busy} onClick={()=>void confirm()}>{busy?'Saving…':'Confirm team change'}</button><button type="button" className="secondary" autoFocus disabled={busy} onClick={()=>setReview(null)}>Keep current access</button></div>
  </section>}
  {role==='owner'&&data&&<details><summary>Team activity · latest {data.events.length}</summary><ul>{data.events.map(e=><li key={e.id}>{e.label} · {e.action.replaceAll('_',' ')} · {e.role} · {new Date(e.created_at).toLocaleString()}</li>)}</ul>{!data.events.length&&<p>No team changes yet.</p>}</details>}
 </section>;
}
