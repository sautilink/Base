'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '../../lib/supabase';
import Brand from '../brand';

type AuthMode = 'password' | 'signup' | 'link';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function finishSignIn() {
    if (new URLSearchParams(window.location.search).get('next') === '/miniapp') router.replace('/miniapp');
    else window.location.assign('/dashboard');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const supabase = await getSupabase();
      const address = email.trim();
      if (mode === 'password') {
        const { data, error } = await supabase.auth.signInWithPassword({ email: address, password });
        if (error) throw error;
        if (!data.session) throw new Error('No session was created. Please try again.');
        finishSignIn();
      } else if (mode === 'signup') {
        if (password !== confirmPassword) throw new Error('The passwords do not match.');
        const { data, error } = await supabase.auth.signUp({
          email: address,
          password,
          options: { emailRedirectTo: window.location.origin + '/dashboard' }
        });
        if (error) throw error;
        if (data.session) finishSignIn();
        else setMessage('Check your email to confirm your new account, then sign in with your password.');
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email: address,
          options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + '/dashboard' }
        });
        if (error) throw error;
        setMessage('Check your email for your sign-in link.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  function chooseMode(next: AuthMode) {
    setMode(next);
    setPassword('');
    setConfirmPassword('');
    setMessage('');
  }

  return <main><section className="card auth-card">
    <Brand/>
    <h1>{mode === 'signup' ? 'Create your account.' : 'Welcome back.'}</h1>
    <p>{mode === 'signup'
      ? 'Sign up to build Telegram bots. New accounts need email confirmation.'
      : 'Sign in to manage your Telegram bots. All features are free.'}</p>
    <div className="auth-modes" role="group" aria-label="Sign-in method">
      <button type="button" className={mode === 'password' ? 'selected' : 'secondary'}
        aria-pressed={mode === 'password'} onClick={() => chooseMode('password')}>Password</button>
      <button type="button" className={mode === 'signup' ? 'selected' : 'secondary'}
        aria-pressed={mode === 'signup'} onClick={() => chooseMode('signup')}>Sign up</button>
      <button type="button" className={mode === 'link' ? 'selected' : 'secondary'}
        aria-pressed={mode === 'link'} onClick={() => chooseMode('link')}>Email link</button>
    </div>
    <form onSubmit={event => void submit(event)}>
      <label htmlFor="email">Email address</label>
      <input id="email" type="email" autoComplete="email" value={email}
        onChange={event => setEmail(event.target.value)} required placeholder="you@example.com" />
      {mode !== 'link' && <>
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          minLength={mode === 'signup' ? 12 : undefined} value={password}
          onChange={event => setPassword(event.target.value)} required />
      </>}
      {mode === 'signup' && <>
        <label htmlFor="confirm-password">Confirm password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" minLength={12}
          value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required />
      </>}
      <button disabled={busy} type="submit">{busy ? 'Please wait...' :
        mode === 'password' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Email me a sign-in link'}</button>
    </form>
    {mode === 'password' && <p className="notice">Already signed in with an email link? Set a password in your dashboard first.</p>}
    {mode === 'signup' && <p className="notice">Bot connection is currently limited to approved test accounts.</p>}
    {message && <p role="status" className="notice">{message}</p>}
  </section></main>;
}
