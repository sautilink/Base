import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { pool, verifiedUserId } from './auth-db';
import { validUuid } from './bot-config';

export type BotRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type BotPermission = 'read' | 'edit' | 'operate' | 'team' | 'credential';
export const botAccessDependencies = { verifiedUserId, pool };
export function permits(role: string, permission: BotPermission): boolean {
  if (role === 'owner') return true;
  if (role === 'admin') return ['read','edit','operate'].includes(permission);
  if (role === 'editor') return ['read','edit'].includes(permission);
  return role === 'viewer' && permission === 'read';
}
export type AccessRow = { owner_id: string; role: BotRole };
export function authorizeBot(row: AccessRow | undefined, permission: BotPermission): AccessRow {
  if (!row) throw new NotFoundException('Bot not found');
  if (!permits(row.role, permission)) throw new ForbiddenException('Your team role does not allow this action');
  return row;
}
// Membership is read on EVERY request, never from editable JWT metadata or a cache.
// Callers retain the canonical owner predicate in their queries. This does not
// transfer ownership to the actor or grant browser writes to bot tables.
export async function botAccess(auth: string | undefined, botId: string, permission: BotPermission) {
  const actorId = await botAccessDependencies.verifiedUserId(auth);
  if (!validUuid(botId)) throw new BadRequestException('Invalid bot ID');
  const result = await botAccessDependencies.pool().query<AccessRow>(`select b.owner_id,
    case when b.owner_id=$2 then 'owner' else m.role end as role
    from public.base_bots b left join public.base_bot_members m
      on m.bot_id=b.id and m.member_id=$2 and m.status='active'
    where b.id=$1 and (b.owner_id=$2 or m.member_id is not null)`, [botId,actorId]);
  return { ...authorizeBot(result.rows[0],permission), actorId };
}

export function parseTeamInvite(body: unknown) {
  const b = body as { memberId?: unknown; role?: unknown; label?: unknown } | null;
  if (!b || typeof b.memberId !== 'string' || !validUuid(b.memberId)) throw new BadRequestException('Enter a valid Base team ID');
  if (typeof b.role !== 'string' || !['admin','editor','viewer'].includes(b.role)) throw new BadRequestException('Choose Admin, Editor or Viewer');
  if (typeof b.label !== 'string' || !b.label.trim() || b.label.trim().length > 60) throw new BadRequestException('Enter a team label of 1–60 characters');
  return { memberId:b.memberId.toLowerCase(),role:b.role as Exclude<BotRole,'owner'>,label:b.label.trim() };
}
