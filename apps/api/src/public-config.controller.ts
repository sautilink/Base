import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';

export type PublicBaseClientConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  botConnectEnabled: boolean;
  masterBotEnabled: boolean;
};

const BASE_SUPABASE_URL = 'https://gtzqirfwghijuzhvrnha.supabase.co';

export function publicClientConfig(env: NodeJS.ProcessEnv): PublicBaseClientConfig {
  const url = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  // The publishable key is designed for browsers, unlike the service_role key.
  // Refuse any wrong project URL or a secret API key.
  if (url !== BASE_SUPABASE_URL || !publishableKey?.startsWith('sb_publishable_')) {
    throw new ServiceUnavailableException('Base client configuration unavailable');
  }
  return {
    supabaseUrl: BASE_SUPABASE_URL,
    supabasePublishableKey: publishableKey,
    botConnectEnabled: env.BOT_CONNECT_ENABLED === 'true',
    masterBotEnabled: env.MASTER_BOT_ENABLED === 'true'
  };
}

@Controller()
export class PublicConfigController {
  @Get('client-config')
  @Header('Cache-Control', 'no-store')
  getConfig(): PublicBaseClientConfig {
    return publicClientConfig(process.env);
  }
}
