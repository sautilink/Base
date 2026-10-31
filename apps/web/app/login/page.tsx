'use client';
import { useState, type FormEvent } from 'react';
import { getSupabase } from '../../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + '/dashboard' }
      });
      setMessage(error ? error.message : 'Check your email for your sign-in link.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start sign-in.');
    } finally {
      setBusy(false);
    }
  }
  return <main><section className="card auth-card">
    <span className="eyebrow">SAUTILINK BASE</span>
    <h1>Welcome back.</h1>
    <p>Sign in to manage your Telegram bots. All features are free.</p>
    <form onSubmit={submit}>
      <label htmlFor="email">Email address</label>
      <input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
      <button disabled={busy} type="submit">{busy ? 'Sending...' : 'Email me a sign-in link'}</button>
    </form>
    {message && <p role="status" className="notice">{message}</p>}
  </section></main>;
}
