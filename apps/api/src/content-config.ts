import { InvalidBotConfig, validUuid } from './bot-config';

export type ContentKind = 'text' | 'photo' | 'video' | 'audio' | 'document';
export type Content = { id: string; title: string; kind: ContentKind; body: string; storage_path: string | null; archived: boolean };
export type Menu = { id: string; parent_id: string | null; title: string; response_text: string; content_id: string | null; url: string | null; position: number };
export type Button = { text: string; callback_data: string } | { text: string; url: string };
export type RichReply = { responseText: string | null; content?: Content; buttons?: Button[] };

export function field(body: unknown, key: string, max: number, empty = false): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InvalidBotConfig('Invalid request');
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== 'string' || value.trim().length > max || (!empty && !value.trim())) throw new InvalidBotConfig('Invalid ' + key);
  return value.trim();
}
export function optionalId(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !validUuid(value)) throw new InvalidBotConfig('Invalid content or parent ID');
  return value;
}
export function parseContent(body: unknown, ownerId: string, botId: string) {
  const title = field(body, 'title', 100);
  const kind = field(body, 'kind', 10) as ContentKind;
  if (!['text', 'photo', 'video', 'audio', 'document'].includes(kind)) throw new InvalidBotConfig('Unsupported content type');
  const text = field(body, 'body', kind === 'text' ? 4000 : 1024, kind !== 'text');
  const data = body as Record<string, unknown>;
  if (kind === 'text') return { title, kind, body: text, storagePath: null, mime: null, bytes: null };
  const path = field(body, 'storagePath', 200);
  const prefix = ownerId + '/' + botId + '/';
  if (!path.startsWith(prefix) || !/^[0-9a-f-]{36}\.(jpg|png|webp|mp4|mp3|ogg|wav|pdf|txt|docx)$/i.test(path.slice(prefix.length))) throw new InvalidBotConfig('Invalid media path');
  const mime = field(body, 'mime', 100);
  const types: Record<string, string[]> = { photo: ['image/jpeg','image/png','image/webp'], video: ['video/mp4'], audio: ['audio/mpeg','audio/ogg','audio/wav'], document: ['application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'] };
  if (!types[kind].includes(mime) || !Number.isSafeInteger(data.bytes) || Number(data.bytes) < 1 || Number(data.bytes) > (kind === 'photo' ? 5 : 10) * 1024 * 1024) throw new InvalidBotConfig('Unsupported file or file too large');
  return { title, kind, body: text, storagePath: path, mime, bytes: Number(data.bytes) };
}
export function parseMenu(body: unknown) {
  const title = field(body, 'title', 64);
  const responseText = field(body, 'responseText', 4000, true);
  const data = body as Record<string, unknown>;
  const parentId = optionalId(data.parentId), contentId = optionalId(data.contentId);
  const url = field({ url: data.url ?? '' }, 'url', 2048, true);
  if (url) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new InvalidBotConfig('Use an HTTPS link'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new InvalidBotConfig('Use an HTTPS link without credentials');
    if (contentId) throw new InvalidBotConfig('Choose content or a link');
  }
  const position = data.position ?? 0;
  if (!Number.isSafeInteger(position) || Number(position) < 0 || Number(position) > 999) throw new InvalidBotConfig('Invalid position');
  return { title, responseText, parentId, contentId, url: url || null, position: Number(position) };
}

export function menuReply(id: string | null, menus: ReadonlyArray<Menu>, contents: ReadonlyArray<Content>): RichReply | null {
  const selected = id ? menus.find(m => m.id === id && !m.url) : null;
  if (id && !selected) return null;
  const content = selected?.content_id ? contents.find(c => c.id === selected.content_id && !c.archived) : undefined;
  const buttons: Button[] = menus.filter(m => m.parent_id === id).sort((a,b) => a.position - b.position || a.id.localeCompare(b.id))
    .map(m => m.url ? { text: m.title, url: m.url } : { text: m.title, callback_data: 'menu:' + m.id });
  if (selected) buttons.push({ text: '‹ Back', callback_data: 'menu:' + (selected.parent_id ?? 'root') });
  return { responseText: content?.body || selected?.response_text || selected?.title || 'Choose an option:', ...(content ? {content} : {}), buttons };
}
