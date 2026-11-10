import type { Content } from './content-config';

export type BroadcastWork = {
  campaignId: string; botId: string; visitorKey: string;
  consentMessageAt: string; consentUpdateId: string; content: Content;
};
export type BroadcastAdapter = {
  lock: () => Promise<(() => Promise<void>) | null>;
  claim: () => Promise<BroadcastWork | 'skipped' | null>;
  eligible: (work: BroadcastWork) => Promise<boolean>;
  send: (work: BroadcastWork) => Promise<void>;
  complete: (work: BroadcastWork, status: 'sent' | 'unknown' | 'skipped') => Promise<void>;
  now?: () => number;
  delay?: () => Promise<void>;
};

/** One global dispatcher, bounded work, and no replay of an ambiguous send. */
export async function dispatchBroadcasts(adapter: BroadcastAdapter) {
  const release = await adapter.lock();
  const result = {busy: !release, sent:0, unknown:0, skipped:0};
  if (!release) return result;
  const now = adapter.now ?? Date.now, deadline = now()+20000;
  try {
    for (let n=0;n<10 && now()<deadline;n++) {
      const work = await adapter.claim();
      if (!work) break;
      if (work === 'skipped') {result.skipped++; continue;}
      let status: 'sent' | 'unknown' | 'skipped' = 'unknown';
      try {
        if (!await adapter.eligible(work)) status='skipped';
        else {await adapter.send(work); status='sent';}
      } catch { /* Never log a token, destination, provider URL or content. */ }
      await adapter.complete(work,status);
      result[status]++;
      if (status === 'unknown') break;
      if (status === 'sent') await (adapter.delay?.() ?? new Promise<void>(resolve => setTimeout(resolve,1100)));
    }
  } finally { await release(); }
  return result;
}
