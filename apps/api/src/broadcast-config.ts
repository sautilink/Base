import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { requireEncryptionKey } from './bot-security';
import { InvalidBotConfig, validUuid } from './bot-config';
import { field, optionalId } from './content-config';
import type { Content } from './content-config';

function destinationKey(encoded: string | undefined): Buffer {
  return createHmac('sha256', requireEncryptionKey(encoded)).update('sautilink-base:broadcast-destination:v1').digest();
}
function aad(botId: string, visitorKey: string): Buffer {
  if (!validUuid(botId) || !/^[a-f0-9]{64}$/.test(visitorKey)) throw new Error('Invalid destination context');
  return Buffer.from(botId.toLowerCase() + '\0' + visitorKey);
}
export function encryptDestination(botId: string, visitorKey: string, chatId: number, encoded: string | undefined): Buffer {
  if (!Number.isSafeInteger(chatId) || chatId <= 0) throw new Error('Invalid destination');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', destinationKey(encoded), iv);
  cipher.setAAD(aad(botId,visitorKey));
  const encrypted = Buffer.concat([cipher.update(String(chatId),'utf8'),cipher.final()]);
  return Buffer.concat([Buffer.from([1]),iv,cipher.getAuthTag(),encrypted]);
}
export function decryptDestination(botId: string, visitorKey: string, payload: Buffer, encoded: string | undefined): number {
  try {
    if (!Buffer.isBuffer(payload) || payload.length < 30 || payload[0] !== 1) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', destinationKey(encoded), payload.subarray(1,13));
    decipher.setAAD(aad(botId,visitorKey)); decipher.setAuthTag(payload.subarray(13,29));
    const raw = Buffer.concat([decipher.update(payload.subarray(29)),decipher.final()]).toString('utf8');
    const id = Number(raw);
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) throw new Error();
    return id;
  } catch { throw new Error('Broadcast destination unavailable'); }
}
export function parseBroadcast(body: unknown): { title: string; contentId: string } {
  const title = field(body,'title',100);
  const contentId = optionalId((body as Record<string,unknown>).contentId);
  if (!contentId) throw new InvalidBotConfig('Choose saved content');
  return {title,contentId};
}
export function parseBroadcastSchedule(body: unknown, now = Date.now()): Date {
  if (!body || typeof body !== 'object' || Array.isArray(body) || (body as {confirm?:unknown}).confirm !== true) throw new InvalidBotConfig('Confirm the broadcast before scheduling');
  const value = (body as {sendAt?:unknown}).sendAt;
  if (value === null) return new Date(now);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw new InvalidBotConfig('Use a UTC date and time');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() < now+60000 || date.getTime() > now+30*86400000) throw new InvalidBotConfig('Choose a time from one minute to 30 days ahead');
  return date;
}
export function broadcastEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.BASE_BROADCAST_ENABLED === 'true' && env.USER_BOT_DELIVERY_ENABLED === 'true' && /^[A-Za-z0-9_-]{43}$/.test(env.BASE_BROADCAST_DISPATCH_KEY ?? '');
}
export function contentFingerprint(c: Content): string {
  return createHash('sha256').update(JSON.stringify([c.id,c.title,c.kind,c.body,c.storage_path,c.archived])).digest('hex');
}
export function parseBroadcastReview(body: unknown): {hash:string;total:number} {
  const data=body as {contentHash?:unknown;expectedRecipients?:unknown}|null;
  if(typeof data?.contentHash!=='string'||!/^[a-f0-9]{64}$/.test(data.contentHash)||!Number.isSafeInteger(data.expectedRecipients)||Number(data.expectedRecipients)<1||Number(data.expectedRecipients)>200)throw new InvalidBotConfig('Review the content and audience before confirming');
  return {hash:data.contentHash,total:Number(data.expectedRecipients)};
}
export function verifyDispatchKey(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected || !/^[A-Za-z0-9_-]{43}$/.test(provided) || !/^[A-Za-z0-9_-]{43}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(provided),Buffer.from(expected));
}
