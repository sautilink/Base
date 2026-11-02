'use client';
import { useEffect, useState } from 'react';

type Day = { day: string; newVisitors: number; messages: number; menuClicks: number };
type Analytics = { visitors: number; subscribers: number; unsubscribed: number; active7d: number; active30d: number; firstSeenAt: string | null; daily: Day[] };
const labels = { messages: 'Messages', newVisitors: 'New visitors', menuClicks: 'Menu clicks' };

export default function AudienceAnalytics({ botId, request }: {
  botId: string; request: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [metric, setMetric] = useState<keyof typeof labels>('messages');
  const [details, setDetails] = useState(false);
  async function load() {
    setBusy(true); setError('');
    try { setData(await request<Analytics>('/bots/' + botId + '/analytics')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load analytics.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    setBusy(true); setError(''); setData(null);
    void request<Analytics>('/bots/' + botId + '/analytics')
      .then(value => { if (active) setData(value); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load analytics.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
    // BotEditor remounts for a new selection; request uses its current session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);
  const total = data?.daily.reduce((n, d) => n + d[metric], 0) ?? 0;
  const maximum = Math.max(1, ...(data?.daily.map(d => d[metric]) ?? []));
  return <section className="builder-section" aria-label="Audience and analytics">
    <div className="delivery-health-heading">
      <div><span className="eyebrow">AUDIENCE</span><h3>Audience & analytics</h3></div>
      <button className="secondary" type="button" disabled={busy} onClick={() => void load()}>{busy ? 'Loading analytics...' : 'Refresh analytics'}</button>
    </div>
    <p>See how people use your bot and how many have chosen to receive updates.</p>
    {error && <p className="notice" role="alert">{error}</p>}
    {data && <>
      <div className="delivery-health-grid" aria-label="Audience totals">
        <div><strong>{data.visitors.toLocaleString()}</strong><small>Unique visitors</small></div>
        <div><strong>{data.subscribers.toLocaleString()}</strong><small>Subscribed to updates</small></div>
        <div><strong>{data.active7d.toLocaleString()}</strong><small>Active · 7 days</small></div>
        <div><strong>{data.active30d.toLocaleString()}</strong><small>Active · 30 days</small></div>
      </div>
      {!data.visitors && <p className="notice" role="status">Your audience starts here. New private messages and menu taps will appear after someone uses your active bot. Past users are not imported.</p>}
      <div className="audience-chart-card">
        <div className="delivery-health-heading">
          <h4>{labels[metric]} · {total.toLocaleString()} in 30 days</h4>
          <div className="inline-actions" aria-label="Chart metric">
            {(Object.keys(labels) as (keyof typeof labels)[]).map(key => <button key={key} className="secondary" type="button" aria-pressed={metric === key} onClick={() => setMetric(key)}>{labels[key]}</button>)}
          </div>
        </div>
        <div className="audience-chart" role="img" aria-label={labels[metric] + ' per day for the past 30 UTC days. Total ' + total + '. Open daily figures for exact values.'}>
          {data.daily.map(d => <div className="audience-chart-column" key={d.day} title={d.day + ': ' + d[metric] + ' ' + labels[metric].toLowerCase()}>
            <span style={{ height: d[metric] ? Math.max(4, d[metric] / maximum * 100) + '%' : '2px' }} data-empty={!d[metric]} />
          </div>)}
        </div>
        <div className="audience-chart-labels"><small>{data.daily[0]?.day}</small><small>Daily totals · UTC</small><small>{data.daily.at(-1)?.day}</small></div>
        <button type="button" className="secondary" aria-expanded={details} onClick={() => setDetails(!details)}>{details ? 'Hide daily figures' : 'Show daily figures'}</button>
        {details && <div className="audience-table-scroll"><table className="audience-table">
          <caption>Daily activity · UTC</caption><thead><tr><th scope="col">Date</th><th scope="col">New visitors</th><th scope="col">Messages</th><th scope="col">Menu clicks</th></tr></thead>
          <tbody>{data.daily.map(d => <tr key={d.day}><th scope="row">{d.day}</th><td>{d.newVisitors}</td><td>{d.messages}</td><td>{d.menuClicks}</td></tr>)}</tbody>
        </table></div>}
      </div>
      <div className="audience-consent"><h4>Subscriptions belong to your visitors</h4>
        <p>Visitors send <code>/subscribe</code> to join and <code>/unsubscribe</code> to leave. Starting the bot does not subscribe them. Opting out keeps ordinary commands and menus available.</p>
        <p className="notice">{data.unsubscribed} opted out. Broadcast sending is a later phase; this page records preferences and usage only.</p>
      </div>
      <p className="notice">Figures begin with this analytics release. Only private text messages and supported menu taps are counted once per Telegram update. No names, usernames, chat IDs or message contents are saved in analytics. Counts do not confirm message receipt.</p>
    </>}
  </section>;
}
