import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, NotFoundException, Param, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { pool, verifiedUserId } from './auth-db';
import { InvalidBotConfig, validUuid } from './bot-config';
import { broadcastEnabled, contentFingerprint, parseBroadcast, parseBroadcastReview, parseBroadcastSchedule, verifyDispatchKey } from './broadcast-config';
import { botConnectTestOwners } from './bot-connect-config';
import { dispatchBroadcasts } from './broadcast-engine';
import { liveBroadcastAdapter } from './broadcast-db';
import type { Content } from './content-config';

function validate<T>(fn:()=>T):T {
  try {return fn();}catch(e){if(e instanceof InvalidBotConfig)throw new BadRequestException(e.message);throw e;}
}
function id(value:string):string {if(!validUuid(value))throw new BadRequestException('Invalid ID');return value;}

@Controller('bots/:botId/broadcasts')
export class BroadcastController {
  private async owner(auth:string|undefined,botId:string) {
    const owner=await verifiedUserId(auth);id(botId);
    if (!(await pool().query('select 1 from public.base_bots where id=$1 and owner_id=$2',[botId,owner])).rowCount) throw new NotFoundException('Bot not found');
    return owner;
  }
  @Get()
  @Header('Cache-Control','no-store')
  async list(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string) {
    const owner=await this.owner(auth,botId);
    const [campaigns,audience,heartbeat]=await Promise.all([
      pool().query(`select c.id,c.title,c.content_id,c.content_snapshot as preview,c.status,c.scheduled_at,c.created_at,
        (select count(*)::int from base_private.broadcast_recipients r where r.campaign_id=c.id) as total,
        (select count(*)::int from base_private.broadcast_recipients r where r.campaign_id=c.id and r.status='sent') as sent,
        (select count(*)::int from base_private.broadcast_recipients r where r.campaign_id=c.id and r.status='unknown') as unknown,
        (select count(*)::int from base_private.broadcast_recipients r where r.campaign_id=c.id and r.status='skipped') as skipped,
        (select count(*)::int from base_private.broadcast_recipients r where r.campaign_id=c.id and r.status in ('queued','processing')) as remaining
        from base_private.broadcast_campaigns c where c.bot_id=$1 and c.owner_id=$2 order by c.created_at desc limit 50`,[botId,owner]),
      pool().query<{eligible:number;subscribers:number}>(`select count(*) filter(where subscription_state='subscribed' and destination_ciphertext is not null)::int as eligible,
        count(*) filter(where subscription_state='subscribed')::int as subscribers from base_private.bot_audience where bot_id=$1`,[botId]),
      pool().query<{fresh:boolean;last_tick_at:Date|null}>("select last_tick_at,coalesce(last_tick_at>now()-interval '3 minutes',false) as fresh from base_private.broadcast_scheduler where singleton")
    ]);
    const state=heartbeat.rows[0];
    return {campaigns:campaigns.rows,eligible:audience.rows[0]?.eligible??0,subscribers:audience.rows[0]?.subscribers??0,
      enabled:broadcastEnabled(process.env),schedulerReady:broadcastEnabled(process.env)&&state?.fresh===true,lastTickAt:state?.last_tick_at??null};
  }
  @Post()
  async create(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Body() body:unknown) {
    const owner=await this.owner(auth,botId),data=validate(()=>parseBroadcast(body));
    const db=await pool().connect();let discard=false;
    try {
      await db.query('BEGIN');await db.query('select pg_advisory_xact_lock(hashtextextended($1,10))',[botId]);
      if(Number((await db.query('select count(*) as n from base_private.broadcast_campaigns where bot_id=$1',[botId])).rows[0].n)>=50)throw new ConflictException('This bot has reached the 50-campaign pilot limit');
      const result=await db.query(`insert into base_private.broadcast_campaigns(bot_id,owner_id,title,content_id)
        select b.id,b.owner_id,$3,c.id from public.base_bots b join public.base_content_items c on c.bot_id=b.id
        where b.id=$1 and b.owner_id=$2 and c.id=$4 and not c.archived returning id`,[botId,owner,data.title,data.contentId]);
      if(!result.rowCount)throw new BadRequestException('Saved content is unavailable');
      await db.query('COMMIT');return result.rows[0];
    }catch(e){try{await db.query('ROLLBACK');}catch{discard=true;}throw e;}
    finally{db.release(discard?new Error('Broadcast rollback failed'):undefined);}
  }
  @Patch(':campaignId')
  async edit(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Param('campaignId') campaignId:string,@Body() body:unknown) {
    const owner=await this.owner(auth,botId),data=validate(()=>parseBroadcast(body));id(campaignId);
    const result=await pool().query(`update base_private.broadcast_campaigns c set title=$4,content_id=$5
      where c.id=$3 and c.bot_id=$1 and c.owner_id=$2 and c.status='draft' and exists
      (select 1 from public.base_content_items i where i.id=$5 and i.bot_id=$1 and not i.archived) returning id`,[botId,owner,campaignId,data.title,data.contentId]);
    if(!result.rowCount)throw new ConflictException('Only available drafts can be edited');
    return result.rows[0];
  }
  @Post(':campaignId/queue')
  async queue(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Param('campaignId') campaignId:string,@Body() body:unknown) {
    const owner=await this.owner(auth,botId);id(campaignId);
    if(!botConnectTestOwners(process.env).has(owner.toLowerCase()))throw new ForbiddenException('Broadcasts are limited to approved test accounts');
    if(!broadcastEnabled(process.env))throw new ConflictException('Broadcast delivery is not enabled yet. Your draft is saved.');
    const scheduledAt=validate(()=>parseBroadcastSchedule(body));
    const review=validate(()=>parseBroadcastReview(body));
    const db=await pool().connect();let discard=false;
    try {
      await db.query('BEGIN');await db.query('select pg_advisory_xact_lock(hashtextextended($1,10))',[botId]);
      if(!(await db.query("select 1 from base_private.broadcast_scheduler where singleton and last_tick_at>now()-interval '3 minutes'")).rowCount)throw new ConflictException('The scheduler is offline. Your draft is saved; try again after it reconnects.');
      const campaign=await db.query<{content_id:string}>("select content_id from base_private.broadcast_campaigns where id=$1 and bot_id=$2 and owner_id=$3 and status='draft' for update",[campaignId,botId,owner]);
      if(!campaign.rowCount)throw new ConflictException('This campaign has already been queued or is unavailable');
      if(!(await db.query("select 1 from public.base_bots where id=$1 and owner_id=$2 and status='active' for share",[botId,owner])).rowCount)throw new ConflictException('Activate the bot before scheduling');
      const quota=await db.query<{n:string}>("select count(*) as n from base_private.broadcast_campaigns where bot_id=$1 and scheduled_at>=date_trunc('day',now())",[botId]);
      if(Number(quota.rows[0].n)>=3)throw new ConflictException('Pilot limit: three broadcasts per bot per day');
      const saved=await db.query<Content>(`select id,title,kind,body,storage_path,archived from public.base_content_items where id=$1 and bot_id=$2 and owner_id=$3 and not archived for share`,[campaign.rows[0].content_id,botId,owner]);
      if(!saved.rows[0])throw new BadRequestException('Saved content is unavailable');
      if(contentFingerprint(saved.rows[0])!==review.hash)throw new ConflictException('Content changed after preview. Review the broadcast again.');
      // Freeze content and membership once. New subscribers do not join a
      // previously queued campaign; re-subscription creates a new consent epoch.
      await db.query(`update base_private.broadcast_campaigns set status='scheduled',scheduled_at=$4,content_snapshot=$5::jsonb where id=$3 and bot_id=$1 and owner_id=$2`,[botId,owner,campaignId,scheduledAt,JSON.stringify(saved.rows[0])]);
      const recipients=await db.query(`insert into base_private.broadcast_recipients(campaign_id,bot_id,visitor_key,consent_message_at,consent_update_id)
        select $1,bot_id,visitor_key,consent_message_at,consent_update_id from base_private.bot_audience
        where bot_id=$2 and subscription_state='subscribed' and destination_ciphertext is not null limit 201 returning campaign_id`,[campaignId,botId]);
      if(!recipients.rowCount)throw new ConflictException('No delivery-ready subscribers. Ask visitors to send /subscribe again after this update.');
      if(recipients.rowCount>200)throw new ConflictException('Pilot limit: 200 subscribers per broadcast');
      if(recipients.rowCount!==review.total)throw new ConflictException('The audience changed after preview. Review the broadcast again.');
      await db.query('COMMIT');return {queued:true,total:recipients.rowCount,scheduledAt};
    }catch(e){try{await db.query('ROLLBACK');}catch{discard=true;}
      if((e as {code?:string})?.code==='23505')throw new ConflictException('Only one scheduled or sending broadcast is allowed per bot');throw e;}
    finally{db.release(discard?new Error('Broadcast rollback failed'):undefined);}
  }
  @Get(':campaignId/preview')
  @Header('Cache-Control','no-store')
  async preview(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Param('campaignId') campaignId:string) {
    const owner=await this.owner(auth,botId);id(campaignId);
    const result=await pool().query<Content>(`select i.id,i.title,i.kind,i.body,i.storage_path,i.archived from public.base_content_items i
      join base_private.broadcast_campaigns c on c.content_id=i.id and c.bot_id=i.bot_id
      where c.id=$3 and c.bot_id=$1 and c.owner_id=$2 and c.status='draft' and not i.archived`,[botId,owner,campaignId]);
    const content=result.rows[0];if(!content)throw new NotFoundException('Draft content unavailable');
    const count=await pool().query<{total:number}>("select count(*)::int as total from base_private.bot_audience where bot_id=$1 and subscription_state='subscribed' and destination_ciphertext is not null",[botId]);
    return {content,contentHash:contentFingerprint(content),total:count.rows[0].total};
  }
  @Post(':campaignId/cancel')
  async cancel(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Param('campaignId') campaignId:string) {
    const owner=await this.owner(auth,botId);id(campaignId);
    const result=await pool().query(`update base_private.broadcast_campaigns set status='cancelled',completed_at=now()
      where id=$3 and bot_id=$1 and owner_id=$2 and status in ('draft','scheduled','sending') returning id`,[botId,owner,campaignId]);
    if(!result.rowCount)throw new ConflictException('This broadcast is already finished or unavailable');
    // The dispatcher also checks campaign state before every network send.
    await pool().query("update base_private.broadcast_recipients set status='skipped',finished_at=now() where campaign_id=$1 and bot_id=$2 and status='queued'",[campaignId,botId]);
    return {cancelled:true};
  }
}

@Controller('internal/broadcasts')
export class BroadcastDispatchController {
  @Post('dispatch')
  @Header('Cache-Control','no-store')
  async dispatch(@Headers('x-base-dispatch-key') key:string|undefined) {
    if(!broadcastEnabled(process.env))throw new NotFoundException();
    if(!verifyDispatchKey(key,process.env.BASE_BROADCAST_DISPATCH_KEY))throw new UnauthorizedException();
    await pool().query('update base_private.broadcast_scheduler set last_tick_at=now() where singleton');
    return dispatchBroadcasts(liveBroadcastAdapter);
  }
}
