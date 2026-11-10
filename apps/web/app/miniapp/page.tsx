'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import DashboardPage from '../dashboard/page';
import Brand from '../brand';
import { getBaseApiUrl, getSupabase } from '../../lib/supabase';

type TelegramWebApp = { ready(): void; expand(): void };
type Gate = 'checking' | 'signed-in' | 'signed-out' | 'missing' | 'invalid' | 'error' | 'auth-error';
const LAUNCH_DATA_KEY = 'base-miniapp-launch-data';

function launchInitData(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash;
  const values = new URLSearchParams(query).getAll('tgWebAppData');
  if (values.length > 1) return null;
  if (values.length === 1 && values[0]) {
    try { window.sessionStorage.setItem(LAUNCH_DATA_KEY, values[0]); } catch { /* Storage can be disabled. */ }
    return values[0];
  }
  try { return window.sessionStorage.getItem(LAUNCH_DATA_KEY); } catch { return null; }
}

export default function MiniAppPage() {
  const [gate, setGate] = useState<Gate>('checking');
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => { void verify(); }, []);

  async function verify() {
    if (started.current) return;
    started.current = true;
    const raw = launchInitData();
    if (!raw) { setGate('missing'); return; }
    const telegram = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    try { telegram?.ready(); } catch { /* UI hint only; signed initData is verified below. */ }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);
    try {
      const api = getBaseApiUrl();
      if (!api) { setFailure('configuration'); setGate('error'); return; }
      const response = await fetch(api + '/telegram/miniapp/verify', {
        method: 'POST', mode: 'cors', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: raw }),
        signal: controller.signal
      });
      if (response.status === 401) {
        try { window.sessionStorage.removeItem(LAUNCH_DATA_KEY); } catch { /* Storage can be disabled. */ }
        setGate('invalid'); return;
      }
      if (!response.ok) { setFailure(`HTTP ${response.status}`); setGate('error'); return; }
      try { telegram?.expand(); } catch { /* Expansion is optional. */ }
    } catch {
      setFailure(controller.signal.aborted ? 'timeout' : 'network');
      setGate('error');
      return;
    } finally {
      window.clearTimeout(timeout);
    }
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.getUser();
      setGate(!error && data.user ? 'signed-in' : 'signed-out');
    } catch { setGate('auth-error'); }
  }

  return <div className="miniapp-root">
    {gate === 'signed-in' ? <DashboardPage /> : <main><section className="card miniapp-card">
      <Brand/>
      <h1>Your bots in Telegram.</h1>
      {gate === 'checking' && <p role="status">Verifying your Telegram session...</p>}
      {gate === 'signed-out' && <>
        <p>Telegram is verified. Sign in to your Base account to manage your bots.</p>
        <Link className="primary-link" href="/login?next=/miniapp">Sign in to Base</Link>
      </>}
      {gate === 'missing' && <p role="status">Open this Mini App from @SautiLinkBaseBot in Telegram.</p>}
      {gate === 'invalid' && <p role="status">This Telegram session is invalid or expired. Close and reopen the Mini App from @SautiLinkBaseBot.</p>}
      {gate === 'error' && <>
        <p role="status">Base verification service is unavailable. Try again.</p>
        {failure && <p>Code: {failure}</p>}
        <button type="button" onClick={() => { started.current = false; setFailure(null); setGate('checking'); void verify(); }}>Retry verification</button>
      </>}
      {gate === 'auth-error' && <p role="status">Base sign-in service is unavailable. Close and reopen the Mini App in a moment.</p>}
    </section></main>}
  </div>;
}
