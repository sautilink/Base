'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '../../lib/supabase';

type Bot = { id: string; username: string; display_name: string; status: string };
export default function DashboardPage() {
  const [status, setStatus] = useState('Checking your session...');
  const [bots, setBots] = useState<Bot[]>([]);
  const [signedIn, setSignedIn] = useState(false);

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
      <button onClick={() => void signOut()}>Sign out</button>
    </>}
  </section></main>;
}
