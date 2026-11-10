'use client';

import { useEffect, useState } from 'react';
import { baseRequest } from '../../lib/base-request';

type Entry = { question: string; answer: string };
type Settings = { entries: Entry[]; telegramEnabled: boolean; providerConfigured: boolean; callsToday: number };

export default function SmartReplies({ botId }: { botId: string }) {
  const path = '/bots/' + botId + '/smart-replies';
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');
  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState('');

  useEffect(() => {
    let active = true;
    baseRequest<Settings>(path)
      .then(result => { if (active) setSettings(result); })
      .catch(() => { if (active) setNotice('Could not load Smart Replies.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [path]);

  function update(changes: Partial<Settings>) {
    setSettings(current => current && { ...current, ...changes });
    setDirty(true);
    setReply('');
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try { await action(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Smart Replies request failed.'); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!settings) return;
    await baseRequest(path, { method: 'PATCH', body: JSON.stringify({
      entries: settings.entries, telegramEnabled: settings.telegramEnabled,
    }) });
    setDirty(false);
    setNotice('Knowledge Base saved.');
  }

  async function preview() {
    setReply('');
    const result = await baseRequest<{ reply: string }>(path + '/preview', {
      method: 'POST', body: JSON.stringify({ question }),
    });
    setReply(result.reply);
    const latest = await baseRequest<Settings>(path).catch(() => null);
    if (latest) setSettings(latest);
  }

  return <section className="builder-section" aria-label="Smart Replies">
    <span className="eyebrow">SMART REPLIES</span>
    <h3>Knowledge Base</h3>
    <p>Save questions and approved answers. OpenAI matches a question to an FAQ and the bot uses your saved answer.</p>
    {notice && <p role="status" className="notice">{notice}</p>}
    {settings ? <>
      <form onSubmit={event => { event.preventDefault(); void run(save); }}>
        <fieldset disabled={busy}>
          {settings.entries.map((entry, index) => <div className="broadcast-campaign" key={index}>
            <label htmlFor={'smart-faq-q-' + index}>Question {index + 1}</label>
            <input id={'smart-faq-q-' + index} value={entry.question} required maxLength={160} onChange={event =>
              update({ entries: settings.entries.map((item, i) => i === index ? { ...item, question: event.target.value } : item) })} />
            <label htmlFor={'smart-faq-a-' + index}>Approved answer {index + 1}</label>
            <textarea id={'smart-faq-a-' + index} value={entry.answer} required maxLength={1200} onChange={event =>
              update({ entries: settings.entries.map((item, i) => i === index ? { ...item, answer: event.target.value } : item) })} />
            <button type="button" className="secondary" onClick={() => {
              const entries = settings.entries.filter((_, i) => i !== index);
              update({ entries, telegramEnabled: entries.length > 0 && settings.telegramEnabled });
            }}>Remove FAQ {index + 1}</button>
          </div>)}
          <button type="button" className="secondary" disabled={settings.entries.length >= 20}
            onClick={() => update({ entries: [...settings.entries, { question: '', answer: '' }] })}>Add FAQ</button>
          <label>
            <input type="checkbox" checked={settings.telegramEnabled} disabled={!settings.entries.length || (!settings.providerConfigured && !settings.telegramEnabled)}
              onChange={event => update({ telegramEnabled: event.target.checked })} /> Enable /ask in Telegram
          </label>
          <p>Visitors must use /ask agree to send their question to OpenAI. Up to 30 matches per bot per UTC day.</p>
          <button type="submit" disabled={!dirty}>Save Knowledge Base</button>
        </fieldset>
      </form>
      <form onSubmit={event => { event.preventDefault(); void run(preview); }}>
        <h4>Try a question</h4>
        <p>Preview uses the saved FAQs and sends this question to OpenAI. Today&apos;s requests: {settings.callsToday} of 30.</p>
        <label htmlFor="smart-preview-question">Test question</label>
        <input id="smart-preview-question" value={question} required maxLength={600} onChange={event => setQuestion(event.target.value)} />
        <button type="submit" disabled={busy || dirty || !settings.entries.length || !settings.providerConfigured}>Preview answer</button>
      </form>
      {!settings.providerConfigured && <p>OpenAI is unavailable for preview and Telegram replies.</p>}
      {reply && <p className="simulated-output" role="status" style={{ whiteSpace: 'pre-wrap' }}>{reply}</p>}
    </> : !busy && <button type="button" className="secondary"
      onClick={() => void run(async () => setSettings(await baseRequest<Settings>(path)))}>Retry loading</button>}
  </section>;
}
