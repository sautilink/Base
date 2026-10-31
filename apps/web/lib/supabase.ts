import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type PublicBaseConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  botConnectEnabled: boolean;
  masterBotEnabled: boolean;
};

const BASE_PROJECT_URL = 'https://gtzqirfwghijuzhvrnha.supabase.co';
const FEATURE_PREVIEW_HOST = 'feat-phase-1-foundation-sautilink-base-web.dr-charles-services.workers.dev';
const STAGING_API_ORIGIN = 'https://sautilink-base-api-staging.onrender.com';

let publicConfig: Promise<PublicBaseConfig> | null = null;
let supabaseClient: Promise<SupabaseClient> | null = null;

export function getBaseApiUrl(): string | null {
  if (typeof window === 'undefined') return null;
  // This staging fallback is permitted ONLY for the isolated GitHub branch
  // Preview. Production/other domains require an explicit build setting.
  if (window.location.hostname === FEATURE_PREVIEW_HOST) return STAGING_API_ORIGIN;
  const configured = process.env.NEXT_PUBLIC_BASE_API_URL;
  if (!configured) return null;
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export async function getPublicBaseConfig(): Promise<PublicBaseConfig> {
  if (!publicConfig) {
    publicConfig = (async () => {
      const origin = getBaseApiUrl();
      if (!origin) throw new Error('SautiLink Base API URL is not configured.');
      // Client configuration only contains public information. No DB or
      // service-role credentials are returned by the server.
      const response = await fetch(origin + '/client-config', {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(90000)
      });
      if (!response.ok) throw new Error('SautiLink Base authentication service is unavailable.');
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new Error('Unexpected SautiLink Base authentication settings.');
      }
      const config = result as Record<string, unknown>;
      if (config.supabaseUrl !== BASE_PROJECT_URL ||
          typeof config.supabasePublishableKey !== 'string' ||
          !config.supabasePublishableKey.startsWith('sb_publishable_') ||
          typeof config.botConnectEnabled !== 'boolean' ||
          typeof config.masterBotEnabled !== 'boolean') {
        throw new Error('Untrusted SautiLink Base authentication settings.');
      }
      return {
        supabaseUrl: BASE_PROJECT_URL,
        supabasePublishableKey: config.supabasePublishableKey,
        botConnectEnabled: config.botConnectEnabled,
        masterBotEnabled: config.masterBotEnabled
      };
    })().catch(error => {
      // Cold-start and network failures must not permanently poison the page.
      publicConfig = null;
      throw error;
    });
  }
  return publicConfig;
}

export async function getSupabase(): Promise<SupabaseClient> {
  if (!supabaseClient) {
    supabaseClient = (async () => {
      const config = await getPublicBaseConfig();
      return createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
      });
    })().catch(error => {
      supabaseClient = null;
      throw error;
    });
  }
  return supabaseClient;
}
