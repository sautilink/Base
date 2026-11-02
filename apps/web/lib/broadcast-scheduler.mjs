// Server-side Worker only. This module never reads a browser session or user input.
export async function runBroadcastScheduler(env, fetcher = fetch) {
  const key = env.BASE_BROADCAST_DISPATCH_KEY;
  if (!/^[A-Za-z0-9_-]{43}$/.test(key ?? '')) return { disabled: true };
  const response = await fetcher('https://sautilink-base-api-staging.onrender.com/internal/broadcasts/dispatch', {
    method: 'POST', headers: { 'x-base-dispatch-key': key }, redirect: 'error',
    signal: AbortSignal.timeout(150000)
  });
  if (!response.ok) throw new Error('Base broadcast dispatcher unavailable');
  return { ok: true };
}
