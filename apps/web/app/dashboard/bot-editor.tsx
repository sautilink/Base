'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { getSupabase } from '../../lib/supabase';
import ContentManager from './content-manager';
import AudienceAnalytics from './audience-analytics';

type Command = { id: string; command: string; response_text: string; content_id?: string|null };
type Rule = { id: string; keyword: string; response_text: string; enabled: boolean };
type Config = {
  bot: { id: string; username: string; display_name: string; status: string; welcome_message: string };
  commands: Command[];
  rules: Rule[];
  menus?:{id:string}[];
};
type ErrorResponse = { message?: string | string[] };
type Simulation = { simulated: true; matchType: 'welcome' | 'command' | 'keyword' | 'menu' | 'content' | 'subscription' | 'none'; matchedValue: string | null; responseText: string | null;content?:{title:string;kind:string} };
type WebhookHealth = {
  ownership: 'base' | 'none' | 'other';
  pendingUpdates: number | null;
  lastErrorAt: string | null;
};
type DeliveryHealth = {
  sent24h: number; ignored24h: number; unknown7d: number;
  processing7d: number; staleProcessing7d: number;
  lastUpdateAt: string | null; needsReview: boolean;
};

function describeError(value: ErrorResponse, status: number): string {
  if (typeof value.message === 'string') return value.message;
  if (Array.isArray(value.message)) return value.message.join(', ');
  return 'Request failed (' + status + ').';
}

export default function BotEditor({ botId, apiUrl, deliveryEnabled, onStatusChange }: {
  botId: string; apiUrl: string; deliveryEnabled: boolean; onStatusChange: (status: string) => void
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [notice, setNotice] = useState('Loading bot settings...');
  const [busy, setBusy] = useState(false);
  const [welcome, setWelcome] = useState('');
  const [command, setCommand] = useState('');
  const [commandResponse, setCommandResponse] = useState('');
  const [editingCommand, setEditingCommand] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [ruleResponse, setRuleResponse] = useState('');
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [sampleMessage, setSampleMessage] = useState('/start');
  const [sampleResponse, setSampleResponse] = useState<Simulation | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [deliveryHealth, setDeliveryHealth] = useState<DeliveryHealth | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthError, setHealthError] = useState('');
  const [webhookHealth, setWebhookHealth] = useState<WebhookHealth | null>(null);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookError, setWebhookError] = useState('');
  const [replacementToken, setReplacementToken] = useState('');

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error('Your session expired. Sign in again.');
    const response = await fetch(new URL(path, apiUrl), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + data.session.access_token,
        ...init.headers
      },
      cache: 'no-store'
    });
    const body = await response.json().catch(() => ({})) as ErrorResponse;
    if (!response.ok) throw new Error(describeError(body, response.status));
    return body as T;
  }

  async function refreshDeliveryHealth(): Promise<void> {
    if (!deliveryEnabled) return;
    setHealthBusy(true);
    setHealthError('');
    try {
      const summary = await request<DeliveryHealth>('/bots/' + botId + '/delivery-health');
      setDeliveryHealth(summary);
    } catch {
      setHealthError('Could not load delivery diagnostics. Bot configuration is still available.');
    } finally {
      setHealthBusy(false);
    }
  }

  async function refreshWebhookHealth(): Promise<void> {
    if (!deliveryEnabled) return;
    setWebhookBusy(true);
    setWebhookError('');
    try {
      const result = await request<WebhookHealth>('/bots/' + botId + '/webhook-health');
      setWebhookHealth(result);
    } catch {
      setWebhookHealth(null);
      setWebhookError('Telegram webhook status is unavailable. Bot configuration is unaffected.');
    } finally {
      setWebhookBusy(false);
    }
  }

  async function refresh(): Promise<void> {
    const latest = await request<Config>('/bots/' + botId + '/config');
    setConfig(latest);
    setWelcome(latest.bot.welcome_message);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      setNotice('Loading bot settings...');
      try {
        const latest = await request<Config>('/bots/' + botId + '/config');
        if (!active) return;
        setConfig(latest);
        setWelcome(latest.bot.welcome_message);
        setNotice('');
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : 'Unable to load bot settings.');
      }
    }
    void load();
    return () => { active = false; };
    // The editor is remounted when selecting a different bot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, apiUrl]);

  useEffect(() => {
    if (deliveryEnabled) {
      void refreshDeliveryHealth();
      void refreshWebhookHealth();
    }
    // The editor remounts whenever the selected bot changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, apiUrl, deliveryEnabled]);

  async function mutate(work: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    setNotice('');
    try {
      await work();
      await refresh();
      setNotice(success);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to save changes.');
    } finally {
      setBusy(false);
    }
  }

  async function changeDelivery(action: 'activate' | 'deactivate'): Promise<void> {
    setBusy(true);
    setNotice('');
    try {
      const result = await request<{ status: string; webhookCleanupPending?: boolean }>(
        '/bots/' + botId + '/' + action, { method: 'POST' }
      );
      await refresh();
      void refreshDeliveryHealth();
      void refreshWebhookHealth();
      onStatusChange(result.status);
      setCleanupPending(result.webhookCleanupPending === true);
      setNotice(action === 'activate' ? 'Bot activated. Saved replies are now live on Telegram.' :
        result.webhookCleanupPending ? 'Bot paused. Telegram webhook cleanup will need a retry.' :
          'Bot paused. Telegram replies are off.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to change bot delivery.');
    } finally {
      setBusy(false);
    }
  }

  async function rotateToken(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!replacementToken) return;
    setBusy(true);
    setNotice('');
    try {
      await request('/bots/' + botId + '/rotate-token', {
        method: 'POST',
        body: JSON.stringify({ token: replacementToken })
      });
      setReplacementToken('');
      await refresh();
      void refreshWebhookHealth();
      setNotice('Replacement token saved securely. Bot remains paused. Activate it when you are ready.');
    } catch (error) {
      setNotice((error instanceof Error ? error.message : 'Unable to replace bot token.') +
        ' For security, paste the token again if you retry.');
    } finally {
      // Never retain sensitive BotFather credentials in the editor after an
      // attempt, including validation errors or Telegram outages.
      setReplacementToken('');
      setBusy(false);
    }
  }

  async function saveWelcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate(() => request('/bots/' + botId + '/welcome', {
      method: 'PATCH', body: JSON.stringify({ message: welcome })
    }), config?.bot.status === 'active' ? 'Welcome message saved and live.' : 'Welcome message saved. Activate the bot when ready.');
  }

  async function saveCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const method = editingCommand ? 'PATCH' : 'POST';
    const path = '/bots/' + botId + '/commands' + (editingCommand ? '/' + editingCommand : '');
    await mutate(async () => {
      await request(path, { method, body: JSON.stringify({ command, responseText: commandResponse }) });
      setEditingCommand(null);
      setCommand('');
      setCommandResponse('');
    }, config?.bot.status === 'active' ? 'Command saved and live.' : 'Command saved. Activate the bot when ready.');
  }

  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const method = editingRule ? 'PATCH' : 'POST';
    const path = '/bots/' + botId + '/rules' + (editingRule ? '/' + editingRule : '');
    await mutate(async () => {
      await request(path, { method, body: JSON.stringify({ keyword, responseText: ruleResponse, enabled: ruleEnabled }) });
      setEditingRule(null);
      setKeyword('');
      setRuleResponse('');
      setRuleEnabled(true);
    }, config?.bot.status === 'active' ? 'Keyword reply saved and live.' : 'Keyword reply saved. Activate the bot when ready.');
  }

  async function simulate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSimulating(true);
    setSampleResponse(null);
    setNotice('');
    try {
      const result = await request<Simulation>('/bots/' + botId + '/simulate', {
        method: 'POST',
        body: JSON.stringify({ message: sampleMessage })
      });
      setSampleResponse(result);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to test this message.');
    } finally {
      setSimulating(false);
    }
  }

  const active = config?.bot.status === 'active';
  const hasResponse = !!config && (
    !!config.bot.welcome_message.trim() ||
    !!config.menus?.length ||
    config.commands.some(item => !!item.response_text.trim() || !!item.content_id) ||
    config.rules.some(item => item.enabled && !!item.response_text.trim())
  );

  return <section className="builder" aria-label="Bot editor">
    <header className="builder-header">
      <div>
        <span className="eyebrow">BOT BUILDER</span>
        <h2>@{config?.bot.username ?? 'Your bot'}</h2>
        <p>{active ? 'Your saved replies are live in private Telegram chats.' :
          'Configure a reply, then activate your bot when you are ready.'}</p>
      </div>
      <span className="pill">{active ? 'Live on Telegram' : 'Configuration only'}</span>
    </header>
    {notice && <p className="notice" role="status">{notice}</p>}
    {!config ? null : <>
      <AudienceAnalytics botId={botId} request={request}/>
      <ContentManager botId={botId} request={request} onChanged={refresh}/>
      <div className="builder-section">
        <h3>Telegram delivery</h3>
        {active ? <>
            <p>Your configured replies are being delivered in private chats. Pause to stop new replies.</p>
            <button type="button" className="secondary" disabled={busy}
              onClick={() => void changeDelivery('deactivate')}>{busy ? 'Working...' : 'Pause bot'}</button>
          </> : !deliveryEnabled ? <>
            <p>Bot activation is disabled. If this bot was previously active, you can retry Telegram webhook cleanup.</p>
            <button type="button" className="secondary" disabled={busy}
              onClick={() => void changeDelivery('deactivate')}>{busy ? 'Working...' : 'Retry webhook cleanup'}</button>
          </> : <>
            <p>{hasResponse ? 'Your bot has a saved reply and can be activated.' :
              'Save a welcome message, command, or enabled keyword reply before activation.'}</p>
            <button type="button" disabled={busy || !hasResponse}
              onClick={() => void changeDelivery('activate')}>{busy ? 'Working...' : 'Activate bot'}</button>
            <button type="button" className="secondary" disabled={busy}
              onClick={() => void changeDelivery('deactivate')}>
              {cleanupPending ? 'Retry webhook cleanup' : 'Verify webhook cleanup'}
            </button>
          </>}
      </div>
      {deliveryEnabled && !active && <form className="builder-section" onSubmit={event => void rotateToken(event)}>
        <h3>Replace BotFather token</h3>
        <p>Use this only after regenerating this same bot's token in BotFather. The bot must remain paused; its Telegram bot identity is verified before the encrypted credential is replaced. This never activates the bot automatically.</p>
        <label htmlFor="replacement-token">New BotFather token</label>
        <input id="replacement-token" type="password" autoComplete="off" spellCheck={false}
          maxLength={256} value={replacementToken} onChange={event => setReplacementToken(event.target.value)}
          placeholder="Paste a replacement token for this bot" />
        <button type="submit" disabled={busy || !replacementToken.trim()}>
          {busy ? 'Checking token...' : 'Verify and replace token'}
        </button>
      </form>}
      {deliveryEnabled && <section className="builder-section" aria-label="Telegram webhook diagnostics">
        <div className="delivery-health-heading">
          <h3>Telegram webhook</h3>
          <button type="button" className="secondary" disabled={webhookBusy}
            onClick={() => void refreshWebhookHealth()}>{webhookBusy ? 'Checking...' : 'Check webhook'}</button>
        </div>
        <p>Read-only Telegram status. This check never changes your webhook, bot token or message delivery.</p>
        {webhookError && <p className="notice" role="status">{webhookError}</p>}
        {webhookHealth && <>
          <p role="status"><strong>{webhookHealth.ownership === 'base' ? 'Connected to Base' :
            webhookHealth.ownership === 'none' ? 'No Telegram webhook configured' :
              'Another application owns this Telegram webhook'}</strong></p>
          <p className="notice">Telegram pending updates: {webhookHealth.pendingUpdates ?? 'Unavailable'}.
            Last reported Telegram webhook error: {webhookHealth.lastErrorAt ?
              new Date(webhookHealth.lastErrorAt).toLocaleString() : 'None reported'}.</p>
          {webhookHealth.ownership === 'other' &&
            <p className="notice">Base will not take over or delete another application's webhook.
              Resolve the external webhook before activating this bot.</p>}
          {active && webhookHealth.ownership !== 'base' &&
            <p className="notice" role="alert">This bot is marked active but the expected Base webhook is not confirmed.
              Pause it and check Telegram configuration before reactivating.</p>}
          {!active && webhookHealth.ownership === 'base' &&
            <p className="notice" role="alert">The bot is paused, but Telegram still points to Base.
              Use Verify webhook cleanup above and refresh the status.</p>}
        </>}
      </section>}
      {deliveryEnabled && <section className="builder-section" aria-label="Delivery health">
        <div className="delivery-health-heading">
          <h3>Delivery health</h3>
          <button type="button" className="secondary" disabled={healthBusy}
            onClick={() => void refreshDeliveryHealth()}>{healthBusy ? 'Checking...' : 'Refresh status'}</button>
        </div>
        <p>Private Telegram message delivery, summarized without storing chats or bot tokens. The figures below are diagnostic—not proof of receipt.</p>
        {healthError && <p className="notice" role="status">{healthError}</p>}
        {deliveryHealth && <>
          <div className="delivery-health-grid" aria-label="Delivery statistics">
            <div><strong>{deliveryHealth.sent24h}</strong><small>Accepted · 24h</small></div>
            <div><strong>{deliveryHealth.ignored24h}</strong><small>Ignored · 24h</small></div>
            <div><strong>{deliveryHealth.unknown7d}</strong><small>Unknown · 7d</small></div>
            <div><strong>{deliveryHealth.staleProcessing7d}</strong><small>Stalled over 5m · 7d</small></div>
          </div>
          {deliveryHealth.needsReview ?
            <p className="notice" role="status">Some deliveries need operator review. Telegram may already have sent an unknown response, so Base will not retry it automatically. You can pause the bot above.</p> :
            <p className="notice" role="status">No unknown or stalled deliveries found in the seven-day view.</p>}
          <p className="notice">Processing updates (7d): {deliveryHealth.processing7d}. Last update within seven days: {deliveryHealth.lastUpdateAt ? new Date(deliveryHealth.lastUpdateAt).toLocaleString() : 'None'}.</p>
        </>}
      </section>}
      <form className="builder-section" onSubmit={event => void saveWelcome(event)}>
        <h3>Welcome message</h3>
        <p>Text to send when someone starts your bot.</p>
        <label htmlFor="welcome-message">Message (up to 4,000 characters)</label>
        <textarea id="welcome-message" maxLength={4000} rows={3}
          value={welcome} onChange={event => setWelcome(event.target.value)} />
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save welcome message'}</button>
      </form>

      <form className="builder-section" onSubmit={event => void simulate(event)}>
        <h3>Try your bot (simulation)</h3>
        <p>Test a message against saved commands and keyword replies. No Telegram message is sent.</p>
        <label htmlFor="simulated-message">Test message</label>
        <input id="simulated-message" value={sampleMessage} maxLength={4096} required
          placeholder="/start, /help or hello"
          onChange={event => { setSampleMessage(event.target.value); setSampleResponse(null); }} />
        <button type="submit" disabled={simulating || busy}>{simulating ? 'Testing...' : 'Test response'}</button>
        {sampleResponse && <div className="simulated-output" role="status">
          <strong>{sampleResponse.matchType === 'none' ? 'No matching reply' : 'Simulated bot reply'}</strong>
          {sampleResponse.matchedValue && <small>Matched {sampleResponse.matchType}: {sampleResponse.matchedValue}</small>}
          <p>{sampleResponse.responseText ?? 'This bot has no response configured for that message.'}</p>
          {sampleResponse.content&&<small>Attached {sampleResponse.content.kind}: {sampleResponse.content.title}. Use Content Manager preview to view the file.</small>}
          <small>Preview only. The real Telegram bot has not sent anything.</small>
        </div>}
      </form>

      <div className="builder-section">
        <h3>Bot commands</h3>
        <p>Save a response to a command such as /help.</p>
        {config.commands.map(item => <div className="config-row" key={item.id}>
          <div><strong>/{item.command}</strong><small>{item.content_id?'Connected to saved content':item.response_text}</small></div>
          <div className="inline-actions">
            <button type="button" className="secondary" disabled={busy}
              onClick={() => { setEditingCommand(item.id); setCommand(item.command); setCommandResponse(item.response_text); }}>
              {item.content_id?'Replace with text':'Edit'}
            </button>
            <button type="button" className="danger" disabled={busy}
              onClick={() => {
                if (window.confirm('Delete /' + item.command + '?')) {
                  void mutate(() => request('/bots/' + botId + '/commands/' + item.id, { method: 'DELETE' }), 'Command deleted.');
                }
              }}>Delete</button>
          </div>
        </div>)}
        <form onSubmit={event => void saveCommand(event)}>
          <h4>{editingCommand ? 'Edit command' : 'Add a command'}</h4>
          <label htmlFor="command-name">Command</label>
          <input id="command-name" placeholder="/help" maxLength={33} required
            value={command} onChange={event => setCommand(event.target.value)} />
          <label htmlFor="command-response">Response text</label>
          <textarea id="command-response" maxLength={4000} rows={3} required
            value={commandResponse} onChange={event => setCommandResponse(event.target.value)} />
          <div className="inline-actions">
            <button type="submit" disabled={busy}>{editingCommand ? 'Save command' : 'Add command'}</button>
            {editingCommand && <button type="button" className="secondary"
              onClick={() => { setEditingCommand(null); setCommand(''); setCommandResponse(''); }}>Cancel</button>}
          </div>
        </form>
      </div>

      <div className="builder-section">
        <h3>Keyword replies</h3>
        <p>Save an automatic reply to a matching keyword.</p>
        {config.rules.map(item => <div className="config-row" key={item.id}>
          <div><strong>{item.keyword}</strong><small>{item.response_text}</small>
            <small>{item.enabled ? 'Enabled' : 'Paused'}</small></div>
          <div className="inline-actions">
            <button type="button" className="secondary" disabled={busy}
              onClick={() => void mutate(() => request('/bots/' + botId + '/rules/' + item.id + '/toggle', {
                method: 'PATCH', body: JSON.stringify({ enabled: !item.enabled })
              }), item.enabled ? 'Reply paused.' : 'Reply enabled.')}>
              {item.enabled ? 'Pause' : 'Enable'}
            </button>
            <button type="button" className="secondary" disabled={busy}
              onClick={() => { setEditingRule(item.id); setKeyword(item.keyword); setRuleResponse(item.response_text); setRuleEnabled(item.enabled); }}>Edit</button>
            <button type="button" className="danger" disabled={busy}
              onClick={() => {
                if (window.confirm('Delete keyword reply for ' + item.keyword + '?')) {
                  void mutate(() => request('/bots/' + botId + '/rules/' + item.id, { method: 'DELETE' }), 'Reply deleted.');
                }
              }}>Delete</button>
          </div>
        </div>)}
        <form onSubmit={event => void saveRule(event)}>
          <h4>{editingRule ? 'Edit keyword reply' : 'Add a keyword reply'}</h4>
          <label htmlFor="rule-keyword">Keyword</label>
          <input id="rule-keyword" maxLength={128} required placeholder="hello"
            value={keyword} onChange={event => setKeyword(event.target.value)} />
          <label htmlFor="rule-response">Response text</label>
          <textarea id="rule-response" maxLength={4000} rows={3} required
            value={ruleResponse} onChange={event => setRuleResponse(event.target.value)} />
          <label className="toggle-option" htmlFor="rule-enabled">
            <input type="checkbox" id="rule-enabled" checked={ruleEnabled}
              onChange={event => setRuleEnabled(event.target.checked)} />
            Reply enabled
          </label>
          <div className="inline-actions">
            <button type="submit" disabled={busy}>{editingRule ? 'Save reply' : 'Add reply'}</button>
            {editingRule && <button type="button" className="secondary"
              onClick={() => { setEditingRule(null); setKeyword(''); setRuleResponse(''); setRuleEnabled(true); }}>Cancel</button>}
          </div>
        </form>
      </div>
    </>}
  </section>;
}
