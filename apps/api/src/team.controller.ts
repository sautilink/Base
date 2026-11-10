import { BadRequestException, Body, ConflictException, Controller, Get, Header, Headers, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { pool, verifiedUserId } from './auth-db';
import { botAccess, parseTeamInvite } from './bot-access';
import { validUuid } from './bot-config';
import { botConnectTestOwners } from './bot-connect-config';
import type { PoolClient } from 'pg';

type Member = { id:string; bot_id:string; member_id:string; role:string; label:string; status:string };
function id(value:string) { if(!validUuid(value))throw new BadRequestException('Invalid ID');return value; }
async function event(db:PoolClient,m:Member,actor:string,action:string) {
  await db.query(`insert into base_private.bot_team_events(bot_id,actor_id,member_id,action,role,label)
    values($1,$2,$3,$4,$5,$6)`,[m.bot_id,actor,m.member_id,action,m.role,m.label]);
}
async function transaction<T>(work:(db:PoolClient)=>Promise<T>) {
  const db=await pool().connect();let discard=false;
  try {await db.query('begin');const result=await work(db);await db.query('commit');return result;}
  catch(e){try{await db.query('rollback');}catch{discard=true;}throw e;}
  finally{db.release(discard?new Error('Team rollback failed'):undefined);}
}

@Controller('team')
export class TeamController {
  @Get('workspace')
  @Header('Cache-Control','no-store')
  async workspace(@Headers('authorization') auth:string|undefined) {
    const actor=await verifiedUserId(auth);
    const [bots,invitations]=await Promise.all([
      pool().query(`select b.id,b.username,b.display_name,b.status,
        case when b.owner_id=$1 then 'owner' else m.role end as role
        from public.base_bots b left join public.base_bot_members m on m.bot_id=b.id and m.member_id=$1 and m.status='active'
        where b.owner_id=$1 or m.id is not null order by b.created_at desc limit 100`,[actor]),
      pool().query(`select m.id,m.role,m.expires_at,b.username,b.display_name from public.base_bot_members m
        join public.base_bots b on b.id=m.bot_id where m.member_id=$1 and m.status='invited' and m.expires_at>now()
        order by m.created_at desc limit 50`,[actor])
    ]);
    return {teamId:actor,bots:bots.rows,invitations:invitations.rows};
  }
  @Post('invitations/:invitationId/:decision')
  async respond(@Headers('authorization') auth:string|undefined,@Param('invitationId') invitationId:string,@Param('decision') decision:string) {
    const actor=await verifiedUserId(auth);id(invitationId);
    if(!['accept','decline'].includes(decision))throw new BadRequestException('Invalid decision');
    return transaction(async db=>{
      const result=await db.query<Member>(`update public.base_bot_members set status=$3,updated_at=now()
        where id=$1 and member_id=$2 and status='invited' and expires_at>now() returning *`,[invitationId,actor,decision==='accept'?'active':'revoked']);
      if(!result.rows[0])throw new ConflictException('Invitation expired, revoked or already answered');
      await event(db,result.rows[0],actor,decision==='accept'?'accepted':'declined');return {saved:true};
    });
  }
  @Post('bots/:botId/leave')
  async leave(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string) {
    const actor=await verifiedUserId(auth);id(botId);
    return transaction(async db=>{
      const result=await db.query<Member>(`update public.base_bot_members set status='revoked',updated_at=now()
        where bot_id=$1 and member_id=$2 and status='active' returning *`,[botId,actor]);
      if(!result.rows[0])throw new NotFoundException('Membership not found');
      await event(db,result.rows[0],actor,'left');return {left:true};
    });
  }
  @Get('bots/:botId')
  @Header('Cache-Control','no-store')
  async list(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string) {
    await botAccess(auth,botId,'team');
    const [members,events]=await Promise.all([
      pool().query(`select id,member_id,role,label,status,expires_at,updated_at from public.base_bot_members where bot_id=$1 order by created_at desc limit 50`,[botId]),
      pool().query(`select id,action,role,label,created_at from base_private.bot_team_events where bot_id=$1 order by created_at desc,id desc limit 50`,[botId])
    ]);
    return {members:members.rows,events:events.rows};
  }
  @Post('bots/:botId/invite')
  async invite(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Body() body:unknown) {
    const access=await botAccess(auth,botId,'team'),data=parseTeamInvite(body);
    if(data.memberId===access.owner_id)throw new BadRequestException('The owner already has full access');
    if(!botConnectTestOwners(process.env).has(data.memberId))throw new BadRequestException('Team invitations are currently limited to approved Base test accounts');
    return transaction(async db=>{
      await db.query('select pg_advisory_xact_lock(hashtextextended($1,11))',[botId]);
      const existing=(await db.query<Member>('select * from public.base_bot_members where bot_id=$1 and member_id=$2 for update',[botId,data.memberId])).rows[0];
      if(existing?.status==='active'||existing?.status==='invited')throw new ConflictException('This account already has a membership or invitation. Revoke it before inviting again.');
      const count=await db.query<{n:number}>(`select count(*)::int as n from public.base_bot_members where bot_id=$1 and status<>'revoked'`,[botId]);
      if(count.rows[0].n>=10)throw new ConflictException('Limit: 10 team members and pending invitations per bot');
      const result=existing?await db.query<Member>(`update public.base_bot_members set role=$2,label=$3,status='invited',expires_at=now()+interval '7 days',updated_at=now() where id=$1 returning *`,[existing.id,data.role,data.label]):
        await db.query<Member>(`insert into public.base_bot_members(bot_id,owner_id,member_id,role,label) values($1,$2,$3,$4,$5) returning *`,[botId,access.owner_id,data.memberId,data.role,data.label]);
      await event(db,result.rows[0],access.actorId,'invited');return {invited:true};
    });
  }
  @Patch('bots/:botId/members/:memberId')
  async change(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Param('memberId') memberId:string,@Body() body:unknown) {
    const access=await botAccess(auth,botId,'team');id(memberId);
    const role=(body as {role?:unknown}|null)?.role;
    if(typeof role!=='string'||!['admin','editor','viewer'].includes(role))throw new BadRequestException('Choose Admin, Editor or Viewer');
    return transaction(async db=>{
      const result=await db.query<Member>(`update public.base_bot_members set role=$3,updated_at=now() where id=$1 and bot_id=$2 and status='active' returning *`,[memberId,botId,role]);
      if(!result.rows[0])throw new ConflictException('Only an active membership can change role');
      await event(db,result.rows[0],access.actorId,'role_changed');return {saved:true};
    });
  }
  @Post('bots/:botId/members/:memberId/revoke')
  async revoke(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Param('memberId') memberId:string) {
    const access=await botAccess(auth,botId,'team');id(memberId);
    return transaction(async db=>{
      const result=await db.query<Member>(`update public.base_bot_members set status='revoked',updated_at=now() where id=$1 and bot_id=$2 and status<>'revoked' returning *`,[memberId,botId]);
      if(!result.rows[0])throw new ConflictException('Membership already revoked or unavailable');
      await event(db,result.rows[0],access.actorId,'revoked');return {revoked:true};
    });
  }
}
