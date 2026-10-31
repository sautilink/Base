'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { getSupabase, getBaseApiUrl, getPublicBaseConfig } from '../../lib/supabase';
import BotEditor from './bot-editor';

type Bot = { id: string; username: string; display_name: string; status: string };

export default function DashboardPage() {
  const [status, setStatus] = useState('Checking your session...');
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [authState, setAuthState] = useState<'loading' | 'signed-in' | 'signed-out' | 'error'>('loading');
  const [authAttempt, setAuthAttempt] = useState(0);
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState('');
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [botConnectEnabled, setBotConnectEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const supabase = await getSupabase();
        if (!active) return;
        setApiUrl(getBaseApiUrl());
        const { data: saved, error: restoreError } = await supabase.auth.getSession();
        if (!active) return;
        if (restoreError) {
          setAuthState('error');
          setStatus('Unable to restore your saved session. Please retry.');
          return;
        }
        if (!saved.session) {
          setAuthState('signed-out');
          setStatus('Please sign in to access your bots.');
          return;
        }
        const { data, error } = await supabase.auth.getUser();
        if (!active) return;
        if (error || !data.user) {
          setAuthState('error');
          setStatus('Unable to verify your saved session. Please retry.');
          return;
        }
        setAuthState('signed-in');
        const result = await supabase.from('base_bots')
          .select('id,username,display_name,status')
          .eq('owner_id', data.user.id).order('created_at', { ascending: false });
        if (!active) return;
        if (result.error) setStatus('Unable to load bots: ' + result.error.message);
        else {
          setBots(result.data ?? []);
          setSelectedBotId(result.data?.[0]?.id ?? null);
          setStatus('');
        }
        try {
          const publicConfig = await getPublicBaseConfig();
          if (active) setBotConnectEnabled(publicConfig.botConnectEnabled);
        } catch {
          // Authentication and bot listing stay usable during an API cold start.
          if (active) setBotConnectEnabled(false);
        }
      } catch (error) {
        if (active) {
          setAuthState('error');
          setStatus(error instanceof Error ? error.message : 'Dashboard unavailable.');
        }
      }
    }
    void load();
    return () => { active = false; };
  }, [authAttempt]);

  async function connectBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConnectMessage('');
    if (!apiUrl || !botConnectEnabled) { setConnectMessage('Bot connections are temporarily disabled while staging security tests finish.'); return; }
    setConnecting(true);
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) throw new Error('Sign in again to continue.');
      const response = await fetch(new URL('/bots/connect', apiUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + data.session.access_token },
        body: JSON.stringify({ token })
      });
      const result = await response.json().catch(() => ({})) as { id?: string; message?: string | string[] };
      if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : 'Unable to connect bot.');
      setToken('');
      setConnectMessage('Bot added to your account. Telegram message delivery is not active yet.');
      const refreshed = await supabase.from('base_bots')
        .select('id,username,display_name,status')
        .eq('owner_id', data.session.user.id).order('created_at', { ascending: false });
      if (!refreshed.error) {
        setBots(refreshed.data ?? []);
        if (result.id) setSelectedBotId(result.id);
      }
    } catch (error) {
      setConnectMessage(error instanceof Error ? error.message : 'Connection failed.');
    } finally {
      setConnecting(false);
    }
  }

  async function signOut() {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return <main className="dashboard-main"><section className="card dashboard-card">
    <div className="dashboard-topline">
      <div><span className="eyebrow">SAUTILINK BASE · DASHBOARD</span>
        <h1>Your bots.</h1>
        <p>Build smarter Telegram bots. All features are free.</p></div>
      {authState === 'signed-in' && <button className="secondary" type="button" onClick={() => void signOut()}>Sign out</button>}
    </div>
    {status && <p role="status" className="notice">{status}</p>}
    {authState === 'signed-out' && <Link href="/login">Sign in to continue</Link>}
    {authState === 'error' && <button className="secondary" type="button" onClick={() => {
      setAuthState('loading');
      setStatus('Checking your session...');
      setAuthAttempt(value => value + 1);
    }}>Retry session check</button>}

    {authState === 'signed-in' && <>
      <section className="builder-section">
        <h2>Connect a Telegram bot</h2>
        <p>Create a bot with <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">BotFather</a>, then connect it here. Bot tokens are secrets; only paste one into this secure form, never in chat or GitHub.</p>
        {!botConnectEnabled && <p className="notice" role="status">Bot connections are temporarily disabled while we complete security testing. You can still manage previously connected bots.</p>}
        <form onSubmit={event => void connectBot(event)}>
          <label htmlFor="bot-token">BotFather token</label>
          <input id="bot-token" type="password" autoComplete="off" value={token}
            onChange={event => setToken(event.target.value)} disabled={!botConnectEnabled || !apiUrl}
            required placeholder="Paste bot token here" />
          <button type="submit" disabled={connecting || !apiUrl || !botConnectEnabled}>{connecting ? 'Connecting...' : 'Connect bot'}</button>
        </form>
        {connectMessage && <p role="status" className="notice">{connectMessage}</p>}
      </section>

      <section className="builder-section">
        <h2>Connected bots <span className="bot-count">{bots.length}</span></h2>
        {bots.length === 0 && <p>No bots connected yet. Create a bot with BotFather to get started.</p>}
        {bots.map(bot => <button className={'bot-select' + (selectedBotId === bot.id ? ' chosen' : '')}
          key={bot.id} type="button" onClick={() => setSelectedBotId(bot.id)}>
          <span><strong>{bot.display_name || bot.username}</strong><small>@{bot.username}</small></span>
          <span className="pill">{bot.status}</span>
        </button>)}
      </section>

      {selectedBotId && apiUrl && <BotEditor key={selectedBotId} botId={selectedBotId} apiUrl={apiUrl} />}
      <p className="dashboard-footer">Need help getting started? Visit <a href="https://t.me/SautiLinkBaseBot" target="_blank" rel="noreferrer">@SautiLinkBaseBot</a> for guidance.</p>
    </>}
  </section></main>;
}
