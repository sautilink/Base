'use client';

import { useEffect, useState } from 'react';
import { baseRequest } from '../../lib/base-request';

type Survey = {
  id: string; question: string; choices: string[]; expires_at: string;
  closed_at: string | null; totals: Record<string, number>;
};
type Review = { kind: 'publish'; id: string; question: string; choices: string[] } | { kind: 'close'; survey: Survey };

export default function Surveys({ botId, canManage }: { botId: string; canManage: boolean }) {
  const path = '/bots/' + botId + '/surveys';
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [question, setQuestion] = useState('');
  const [choices, setChoices] = useState(['', '']);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let current = true;
    baseRequest<{ surveys: Survey[] }>(path)
      .then(result => { if (current) setSurveys(result.surveys); })
      .catch(() => { if (current) setNotice('Could not load surveys. Refresh to try again.'); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [path]);

  async function refresh() {
    const result = await baseRequest<{ surveys: Survey[] }>(path);
    setSurveys(result.surveys);
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try { await action(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update surveys.'); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!review) return;
    if (review.kind === 'close') {
      await baseRequest(path + '/' + review.survey.id + '/close', { method: 'POST', body: JSON.stringify({ confirm: true }) });
    } else {
      const { id, question, choices } = review;
      await baseRequest(path, { method: 'POST', body: JSON.stringify({ id, question, choices, confirm: true }) });
      setQuestion('');
      setChoices(['', '']);
    }
    setReview(null);
    await refresh();
  }

  return <section className="builder-section" aria-label="Surveys">
    <span className="eyebrow">FORMS &amp; SURVEYS</span>
    <h3>Surveys</h3>
    <p>People send /survey in a private chat with your bot, then tap one answer. Results are available for 30 days from publication.</p>
    <button type="button" className="secondary" disabled={busy || !!review} onClick={() => void run(refresh)}>Refresh surveys</button>
    {notice && <p className="notice" role="status">{notice}</p>}
    {!busy && !notice && !surveys.length && <p>No surveys yet.</p>}
    {surveys.map(survey => <article key={survey.id} className="broadcast-campaign">
      <h4>{survey.question}</h4>
      <p>{survey.closed_at ? 'Closed' : 'Open'} · Results until {new Date(survey.expires_at).toLocaleDateString()}</p>
      <ul>{survey.choices.map((choice, index) => <li key={index}>{choice} · {survey.totals[String(index + 1)] ?? 0} votes</li>)}</ul>
      {canManage && !survey.closed_at && <button type="button" className="secondary" disabled={busy || !!review}
        onClick={() => setReview({ kind: 'close', survey })}>Review close</button>}
    </article>)}
    {canManage && !surveys.some(survey => !survey.closed_at) && <form onSubmit={event => {
      event.preventDefault();
      const labels = choices.map(choice => choice.trim());
      if (!question.trim() || labels.some(choice => !choice) || new Set(labels.map(choice => choice.toLowerCase())).size !== labels.length) {
        setNotice('Enter a question and distinct choices.');
        return;
      }
      setNotice('');
      setReview({ kind: 'publish', id: crypto.randomUUID(), question: question.trim(), choices: labels });
    }}>
      <fieldset disabled={busy || !!review}>
        <label htmlFor="base-survey-question">Question</label>
        <input id="base-survey-question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={240} required />
        {choices.map((choice, index) => <div key={index}>
          <label htmlFor={'base-survey-choice-' + index}>Choice {index + 1}</label>
          <input id={'base-survey-choice-' + index} value={choice} maxLength={60} required
            onChange={event => setChoices(choices.map((value, position) => position === index ? event.target.value : value))} />
        </div>)}
        <div className="inline-actions">
          <button type="button" className="secondary" disabled={choices.length >= 6} onClick={() => setChoices([...choices, ''])}>Add choice</button>
          <button type="button" className="secondary" disabled={choices.length <= 2} onClick={() => setChoices(choices.slice(0, -1))}>Remove last choice</button>
          <button type="submit">Review survey</button>
        </div>
      </fieldset>
    </form>}
    {canManage && review && <section className="broadcast-review" aria-label="Review survey change">
      <h4>{review.kind === 'publish' ? 'Publish this survey?' : 'Close this survey?'}</h4>
      <p>{review.kind === 'publish' ? review.question : review.survey.question}</p>
      {review.kind === 'publish' ? <ol>{review.choices.map(choice => <li key={choice}>{choice}</li>)}</ol>
        : <p>People can no longer vote. Existing totals stay available until expiry.</p>}
      <div className="inline-actions">
        <button type="button" disabled={busy} onClick={() => void run(confirm)}>{review.kind === 'publish' ? 'Publish survey' : 'Close survey'}</button>
        <button type="button" className="secondary" autoFocus disabled={busy} onClick={() => setReview(null)}>Cancel</button>
      </div>
    </section>}
  </section>;
}
