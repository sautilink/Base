// @ts-ignore OpenNext generates this module at build time.
import handler from './.open-next/worker.js';
import { runBroadcastScheduler } from './lib/broadcast-scheduler.mjs';

export default {
  fetch: handler.fetch,
  async scheduled(_event: unknown, env: { BASE_BROADCAST_DISPATCH_KEY?: string }) {
    await runBroadcastScheduler(env);
  }
};
