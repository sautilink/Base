import 'reflect-metadata';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { BotsController } from './bots.controller';
import { BotConfigController } from './bot-config.controller';
import { MasterWebhookController } from './master-webhook.controller';
import { pool } from './auth-db';

@Controller('health')
class HealthController {
  @Get()
  status() { return { status: 'ok', service: 'sautilink-base-api' }; }

  // Liveness (/health) is deliberately separate from database readiness.
  // Never expose DB credentials, SQL errors or host configuration in HTTP output.
  @Get('ready')
  async ready() {
    try {
      const result = await pool().query<{
        role_ok: boolean;
        inherited: boolean;
        bots_access: boolean;
        secret_write: boolean;
        secret_read: boolean;
      }>(`select
        current_user = 'base_api_login' as role_ok,
        pg_has_role(current_user, 'base_api_runtime', 'USAGE') as inherited,
        has_table_privilege(current_user, 'public.base_bots', 'SELECT') as bots_access,
        has_column_privilege(current_user, 'base_private.bot_credentials', 'token_ciphertext', 'INSERT') as secret_write,
        has_table_privilege(current_user, 'base_private.bot_credentials', 'SELECT') as secret_read`);
      const state = result.rows[0];
      if (!state || !state.role_ok || !state.inherited || !state.bots_access || !state.secret_write || state.secret_read) {
        throw new Error('Unexpected Base database runtime privileges');
      }
      return { status: 'ready', service: 'sautilink-base-api' };
    } catch {
      throw new ServiceUnavailableException('SautiLink Base database not ready');
    }
  }
}

@Module({ controllers: [HealthController, BotsController, BotConfigController, MasterWebhookController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '16kb' });
  const origin = process.env.WEB_ORIGIN;
  if (origin) app.enableCors({ origin, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type'] });
  await app.listen(Number(process.env.PORT ?? 3001), '0.0.0.0');
}

void bootstrap();
