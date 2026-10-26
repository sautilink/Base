'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '../../lib/supabase';

type Bot = { id: string; username: string; display_name: string; status: string };
export default function DashboardPage() {
  const [status, setStatus] = useState('Checking your session...');
  const [bots, setBots] = useState<Bot[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase.auth.getUser();
        if (!active) return;
        if (error || !data.user) { setStatus('Please sign in to access your bots.'); return; }
        setSignedIn(true);
        const result = await supabase.from('base_bots')
          .select('id,username,display_name,status')
          .eq('owner_id', data.user.id).order('created_at', { ascending: false });
        if (!active) return;
        if (result.error) setStatus('Unable to load bots: ' + result.error.message);
        else { setBots(result.data ?? []); setStatus(''); }
      } catch (error) {
        if (active) setStatus(error instanceof Error ? error.message : 'Dashboard unavailable.');
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function connectBot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConnectMessage('');
    const apiUrl = process.env.NEXT_PUBLIC_BASE_API_URL;
    if (!apiUrl) { setConnectMessage('Bot connection is not deployed yet.'); return; }
    setConnecting(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) throw new Error('Sign in again to continue.');
      const response = await fetch(new URL('/bots/connect', apiUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + data.session.access_token },
        body: JSON.stringify({ token })
      });
      const result = await response.json() as { id?: string; message?: string };
      if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : 'Unable to connect bot.');
      setToken('');
      setConnectMessage('Bot connected. It is inactive until activation is implemented.');
      const refreshed = await supabase.from('base_bots')
        .select('id,username,display_name,status')
        .eq('owner_id', data.session.user.id).order('created_at', { ascending: false });
      if (!refreshed.error) setBots(refreshed.data ?? []);
    } catch (error) {
      setConnectMessage(error instanceof Error ? error.message : 'Connection failed.');
    } finally {
      setConnecting(false);
    }
  }

  async function signOut() {
    await getSupabase().auth.signOut();
    window.location.href = '/login';
  }
  return <main><section className="card dashboard-card">
    <span className="eyebrow">SAUTILINK BASE · DASHBOARD</span>
    <h1>Your bots.</h1>
    {status && <p role="status">{status}</p>}
    {!signedIn && <Link href="/login">Sign in</Link>}
    {signedIn && <><p>{bots.length} connected bots</p>
      {bots.map(bot => <div className="bot-row" key={bot.id}><strong>{bot.display_name || bot.username}</strong><span>@{bot.username} · {bot.status}</span></div>)}
      {bots.length === 0 && !status && <p>No bots connected yet. Bot connection is coming next.</p>}
      <form onSubmit={event => void connectBot(event)}>
        <label htmlFor="bot-token">Connect a bot using its BotFather token</label>
        <input id="bot-token" type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} required placeholder="Bot token" />
        <button type="submit" disabled={connecting}>{connecting ? 'Connecting...' : 'Connect bot'}</button>
      </form>
      {connectMessage && <p role="status">{connectMessage}</p>}
      <button onClick={() => void signOut()}>Sign out</button>
    </>}
  </section></main>;
}
