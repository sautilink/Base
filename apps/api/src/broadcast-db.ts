import { pool } from './auth-db';
import { activeBotToken } from './user-bot-credential';
import { decryptDestination } from './broadcast-config';
import { sendRichReply } from './content-delivery';
import { botConnectTestOwners } from './bot-connect-config';
import type { Content } from './content-config';
import type { BroadcastAdapter, BroadcastWork } from './broadcast-engine';

export const liveBroadcastAdapter: BroadcastAdapter = {
  async lock() {
    const client=await pool().connect();
    try {
      const lock=await client.query<{locked:boolean}>("select pg_try_advisory_lock(731046201) as locked");
      if (!lock.rows[0]?.locked) {client.release(); return null;}
    } catch(error) {client.release(new Error('Broadcast lock failed')); throw error;}
    return async () => {
      let discard=false;
      try {await client.query('select pg_advisory_unlock(731046201)');}
      catch {discard=true;}
      finally {client.release(discard ? new Error('Broadcast unlock failed') : undefined);}
    };
  },
  async claim() {
    const db=await pool().connect();let discard=false;
    try {
      await db.query('BEGIN');
      // A crashed dispatcher may have reached Telegram. Its processing rows
      // become unknown, never queued. Campaigns over a day late expire.
      await db.query("update base_private.broadcast_recipients set status='unknown',finished_at=now() where status='processing' and claimed_at<now()-interval '10 minutes'");
      await db.query("update base_private.broadcast_campaigns set status='cancelled',completed_at=now() where status in ('scheduled','sending') and scheduled_at<now()-interval '24 hours'");
      await db.query("update base_private.broadcast_recipients r set status='skipped',finished_at=now() from base_private.broadcast_campaigns c where r.campaign_id=c.id and r.status='queued' and c.status='cancelled'");
      await db.query("update base_private.broadcast_campaigns c set status='completed',completed_at=now() where c.status in ('scheduled','sending') and not exists(select 1 from base_private.broadcast_recipients r where r.campaign_id=c.id and r.status in ('queued','processing'))");
      const selected=await db.query<{
        campaign_id:string;bot_id:string;visitor_key:string;consent_message_at:string;consent_update_id:string;content_snapshot:Content;
      }>(`select r.campaign_id,r.bot_id,r.visitor_key,r.consent_message_at,r.consent_update_id,c.content_snapshot
        from base_private.broadcast_recipients r join base_private.broadcast_campaigns c on c.id=r.campaign_id
        join public.base_bots b on b.id=r.bot_id
        where r.status='queued' and c.status in ('scheduled','sending') and c.scheduled_at<=now() and b.status='active'
          and c.owner_id=any($1::uuid[])
        order by c.scheduled_at,c.id,r.visitor_key for update of r,c skip locked limit 1`, [[...botConnectTestOwners(process.env)]]);
      const row=selected.rows[0];
      if (!row) {await db.query('COMMIT');return null;}
      const eligible=await db.query(`select 1 from base_private.bot_audience where bot_id=$1 and visitor_key=$2
        and subscription_state='subscribed' and destination_ciphertext is not null and consent_message_at=$3 and consent_update_id=$4`,
        [row.bot_id,row.visitor_key,row.consent_message_at,row.consent_update_id]);
      if (!eligible.rowCount) {
        await db.query("update base_private.broadcast_recipients set status='skipped',finished_at=now() where campaign_id=$1 and visitor_key=$2",[row.campaign_id,row.visitor_key]);
        await db.query('COMMIT');return 'skipped';
      }
      await db.query("update base_private.broadcast_recipients set status='processing',claimed_at=now() where campaign_id=$1 and visitor_key=$2",[row.campaign_id,row.visitor_key]);
      await db.query("update base_private.broadcast_campaigns set status='sending' where id=$1",[row.campaign_id]);
      await db.query('COMMIT');
      return {campaignId:row.campaign_id,botId:row.bot_id,visitorKey:row.visitor_key,consentMessageAt:row.consent_message_at,consentUpdateId:row.consent_update_id,content:row.content_snapshot};
    } catch(error) {try {await db.query('ROLLBACK');}catch{discard=true;}throw error;}
    finally {db.release(discard?new Error('Broadcast rollback failed'):undefined);}
  },
  async eligible(work) {
    return !!(await pool().query(`select 1 from base_private.bot_audience a
      join public.base_bots b on b.id=a.bot_id join base_private.broadcast_campaigns c on c.bot_id=b.id
      where c.id=$1 and c.status='sending' and b.status='active' and a.bot_id=$2 and a.visitor_key=$3
      and a.subscription_state='subscribed' and a.destination_ciphertext is not null
      and a.consent_message_at=$4 and a.consent_update_id=$5`,
      [work.campaignId,work.botId,work.visitorKey,work.consentMessageAt,work.consentUpdateId])).rowCount;
  },
  async send(work) {
    const destination=await pool().query<{destination_ciphertext:Buffer}>(`select a.destination_ciphertext
      from base_private.bot_audience a join public.base_bots b on b.id=a.bot_id
      join base_private.broadcast_campaigns c on c.bot_id=b.id
      where c.id=$1 and c.status='sending' and b.status='active' and a.bot_id=$2 and a.visitor_key=$3
      and a.subscription_state='subscribed' and a.consent_message_at=$4 and a.consent_update_id=$5`,
      [work.campaignId,work.botId,work.visitorKey,work.consentMessageAt,work.consentUpdateId]);
    const encrypted=destination.rows[0]?.destination_ciphertext;
    if (!encrypted) throw new Error('Broadcast destination no longer available');
    const token=await activeBotToken(work.botId);
    const chatId=decryptDestination(work.botId,work.visitorKey,encrypted,process.env.BOT_TOKEN_ENCRYPTION_KEY);
    // Recheck after credential lookup; cancellation/opt-out does not recall a
    // Telegram request that is already in flight.
    if (!await liveBroadcastAdapter.eligible(work)) throw new Error('Broadcast no longer eligible');
    await sendRichReply(token,chatId,work.content.body,{responseText:work.content.body,content:work.content});
  },
  async complete(work,status) {
    await pool().query("update base_private.broadcast_recipients set status=$3,finished_at=now() where campaign_id=$1 and visitor_key=$2 and status='processing'",[work.campaignId,work.visitorKey,status]);
    await pool().query("update base_private.broadcast_campaigns c set status='completed',completed_at=now() where c.id=$1 and c.status='sending' and not exists(select 1 from base_private.broadcast_recipients r where r.campaign_id=c.id and r.status in ('queued','processing'))",[work.campaignId]);
  }
};
