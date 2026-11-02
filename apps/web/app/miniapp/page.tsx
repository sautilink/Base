'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import DashboardPage from '../dashboard/page';
import { getBaseApiUrl, getSupabase } from '../../lib/supabase';

type TelegramWebApp = { initData: string; ready(): void; expand(): void };
type Gate = 'checking' | 'signed-in' | 'signed-out' | 'missing' | 'invalid' | 'error';

export default function MiniAppPage() {
  const [gate, setGate] = useState<Gate>('checking');
  const started = useRef(false);

  useEffect(() => {
    const fallback = window.setTimeout(() => {
      if (!started.current) setGate('missing');
    }, 6000);
    return () => window.clearTimeout(fallback);
  }, []);

  async function verify() {
    if (started.current) return;
    started.current = true;
    const telegram = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    if (!telegram?.initData) { setGate('missing'); return; }
    telegram.ready();
    try {
      const api = getBaseApiUrl();
      if (!api) throw new Error('API unavailable');
      const response = await fetch(api + '/telegram/miniapp/verify', {
        method: 'POST', mode: 'cors', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: telegram.initData }),
        signal: AbortSignal.timeout(15000)
      });
      if (response.status === 401) { setGate('invalid'); return; }
      if (!response.ok) throw new Error('Verification unavailable');
      telegram.expand();
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.getUser();
      setGate(!error && data.user ? 'signed-in' : 'signed-out');
    } catch { setGate('error'); }
  }

  return <div className="miniapp-root">
    <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive"
      onReady={() => void verify()} onError={() => setGate('error')} />
    {gate === 'signed-in' ? <DashboardPage /> : <main><section className="card miniapp-card">
      <span className="eyebrow">SAUTILINK BASE · MINI APP</span>
      <h1>Your bots in Telegram.</h1>
      {gate === 'checking' && <p role="status">Verifying your Telegram session...</p>}
      {gate === 'signed-out' && <>
        <p>Telegram is verified. Sign in to your Base account to manage your bots.</p>
        <Link className="primary-link" href="/login?next=/miniapp">Sign in to Base</Link>
      </>}
      {gate === 'missing' && <p role="status">Open this Mini App from @SautiLinkBaseBot in Telegram.</p>}
      {gate === 'invalid' && <p role="status">This Telegram session is invalid or expired. Close and reopen the Mini App from @SautiLinkBaseBot.</p>}
      {gate === 'error' && <p role="status">Mini App verification is unavailable. Close and reopen it in a moment.</p>}
    </section></main>}
  </div>;
}
