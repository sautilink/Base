'use client';

import { useEffect, useState } from 'react';
import { baseRequest } from '../../lib/base-request';

type Thread = { id: string; updated_at: string; expires_at: string; closed_at: string | null };
type Message = { id: string; direction: 'visitor' | 'team'; text: string; status: string; created_at: string };
type Detail = Pick<Thread, 'id' | 'closed_at' | 'expires_at'> & { messages: Message[] };

function time(value: string) { return new Date(value).toLocaleString(); }

export default function SupportInbox({ botId, active }: { botId: string; active: boolean }) {
  const path = '/bots/' + botId + '/inbox';
  const [threads, setThreads] = useState<Thread[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState('');
  const [review, setReview] = useState<{ text: string; requestId: string } | null>(null);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let current = true;
    baseRequest<{ threads: Thread[] }>(path)
      .then(result => { if (current) setThreads(result.threads); })
      .catch(() => { if (current) setNotice('Could not load conversations. Refresh to try again.'); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [path]);

  async function refresh(id?: string) {
    const result = await baseRequest<{ threads: Thread[] }>(path);
    setThreads(result.threads);
    if (id) setDetail(result.threads.some(thread => thread.id === id)
      ? await baseRequest<Detail>(path + '/' + id) : null);
  }

  async function open(id?: string) {
    if (busy || review) return;
    setBusy(true);
    setNotice('');
    try {
      if (id) {
        setDraft('');
        setDetail(null);
        setDetail(await baseRequest<Detail>(path + '/' + id));
      } else await refresh(detail?.id);
    } catch {
      setDetail(null);
      setNotice('Could not load the inbox. Refresh to try again.');
    } finally { setBusy(false); }
  }

  async function send() {
    if (!detail || !review || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const result = await baseRequest<{ status: string }>(path + '/' + detail.id + '/reply', {
        method: 'POST', body: JSON.stringify({ ...review, confirm: true }),
      });
      setReview(null);
      setDraft('');
      setNotice(result.status === 'accepted' ? 'Telegram accepted your reply.' :
        'Delivery could not be confirmed. Check the conversation before sending again.');
      await refresh(detail.id).catch(() => setDetail(null));
    } catch {
      setNotice('The reply could not be confirmed. Check this same request before sending another reply.');
    } finally { setBusy(false); }
  }

  return <section className="builder-section" aria-label="Support inbox">
    <span className="eyebrow">CUSTOMER SUPPORT</span>
    <h3>Support inbox</h3>
    <p>People can start a private support conversation by sending /support to your bot. Conversations expire after seven days.</p>
    <button type="button" className="secondary" disabled={busy || !!review} onClick={() => void open()}>Refresh inbox</button>
    {notice && <p role="status" className="notice">{notice}</p>}
    {!threads.length && !busy && !notice && <p>No support conversations yet.</p>}
    {threads.length > 0 && <ul>{threads.map(thread => <li key={thread.id}>
      <button type="button" className="secondary" disabled={busy || !!review} aria-pressed={detail?.id === thread.id}
        onClick={() => void open(thread.id)}>Conversation {thread.id.slice(0, 8)} · {thread.closed_at ? 'Closed' : 'Open'} · {time(thread.updated_at)}</button>
    </li>)}</ul>}
    {detail && <article className="broadcast-campaign">
      <h4>Conversation {detail.id.slice(0, 8)}</h4>
      <p>{detail.closed_at ? 'Closed · ' : ''}Expires {time(detail.expires_at)}</p>
      {detail.messages.map(message => <div key={message.id} className="simulated-output">
        <strong>{message.direction === 'visitor' ? 'Visitor' : 'Team'} · {time(message.created_at)}</strong>
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.text}</p>
        {message.direction === 'team' && <small>{message.status === 'accepted' ? 'Accepted by Telegram' : 'Delivery unconfirmed'}</small>}
      </div>)}
      {!active && !detail.closed_at && <p>Activate your bot to reply.</p>}
      {!detail.closed_at && active && <form onSubmit={event => {
        event.preventDefault();
        if (draft.trim()) setReview({ text: draft.trim(), requestId: crypto.randomUUID() });
      }}>
        <label htmlFor="base-support-reply">Reply to this conversation</label>
        <textarea id="base-support-reply" required maxLength={4096} value={draft} disabled={busy || !!review}
          onChange={event => setDraft(event.target.value)} />
        <button type="submit" disabled={busy || !!review || !draft.trim()}>Review reply</button>
      </form>}
      {review && <section className="broadcast-review" aria-label="Review support reply">
        <h4>Send this reply in Telegram?</h4>
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{review.text}</p>
        <div className="inline-actions">
          <button type="button" disabled={busy} onClick={() => void send()}>{notice ? 'Check or finish this send' : 'Send reply'}</button>
          <button type="button" className="secondary" autoFocus disabled={busy} onClick={() => setReview(null)}>Back to conversation</button>
        </div>
      </section>}
    </article>}
  </section>;
}
