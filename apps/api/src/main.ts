import 'reflect-metadata';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { BotsController } from './bots.controller';
import { BotConfigController } from './bot-config.controller';
import { MasterWebhookController } from './master-webhook.controller';
import { PublicConfigController } from './public-config.controller';
import { pool } from './auth-db';
import { registerMasterWebhook } from './master-registration';

@Controller('health')
class HealthController {
  @Get()
  status() { return { status: 'ok', service: 'sautilink-base-api' }; }

  // Liveness (/health) is deliberately separate from database readiness.
  // Never expose DB credentials, SQL errors or host configuration in HTTP output.
  @Get('ready')
  async ready() {
    let phase = 'configuration';
    try {
      const db = pool();
      phase = 'database-query';
      const result = await db.query<{
        role_ok: boolean;
        inherited: boolean;
        bots_access: boolean;
        secret_write: boolean;
        secret_read: boolean;
        ledger_read_id: boolean;
        ledger_insert_id: boolean;
        ledger_insert_status: boolean;
        ledger_update_status: boolean;
        ledger_forbidden_read_status: boolean;
        browser_forbidden_read_id: boolean;
      }>(`select
        current_user = 'base_api_login' as role_ok,
        pg_has_role(current_user, 'base_api_runtime', 'USAGE') as inherited,
        has_table_privilege(current_user, 'public.base_bots', 'SELECT') as bots_access,
        has_column_privilege(current_user, 'base_private.bot_credentials', 'token_ciphertext', 'INSERT') as secret_write,
        has_table_privilege(current_user, 'base_private.bot_credentials', 'SELECT') as secret_read,
        has_column_privilege(current_user, 'base_private.master_update_ledger', 'update_id', 'SELECT') as ledger_read_id,
        has_column_privilege(current_user, 'base_private.master_update_ledger', 'update_id', 'INSERT') as ledger_insert_id,
        has_column_privilege(current_user, 'base_private.master_update_ledger', 'status', 'INSERT') as ledger_insert_status,
        has_column_privilege(current_user, 'base_private.master_update_ledger', 'status', 'UPDATE') as ledger_update_status,
        has_column_privilege(current_user, 'base_private.master_update_ledger', 'status', 'SELECT') as ledger_forbidden_read_status,
        has_column_privilege('authenticated', 'base_private.master_update_ledger', 'update_id', 'SELECT') as browser_forbidden_read_id`);
      const state = result.rows[0];
      phase = 'permissions';
      if (!state || !state.role_ok || !state.inherited || !state.bots_access || !state.secret_write || state.secret_read ||
        !state.ledger_read_id || !state.ledger_insert_id || !state.ledger_insert_status ||
        !state.ledger_update_status || state.ledger_forbidden_read_status || state.browser_forbidden_read_id) {
        // Only safe booleans; do not log the actual database username or DSN.
        console.warn('Base DB role checks', {
          roleOk: state?.role_ok === true,
          inherited: state?.inherited === true,
          botsRead: state?.bots_access === true,
          secretWrite: state?.secret_write === true,
          secretRead: state?.secret_read === true,
          ledgerReadId: state?.ledger_read_id === true,
          ledgerInsertId: state?.ledger_insert_id === true,
          ledgerInsertStatus: state?.ledger_insert_status === true,
          ledgerUpdateStatus: state?.ledger_update_status === true,
          ledgerReadStatus: state?.ledger_forbidden_read_status === true,
          browserCanReadLedger: state?.browser_forbidden_read_id === true
        });
        throw new Error('Unexpected Base database runtime privileges');
      }
      return { status: 'ready', service: 'sautilink-base-api' };
    } catch (error) {
      const maybe = error as { code?: unknown; name?: unknown };
      // Render-only diagnostics: never print the error message, URL, SQL or
      // parameters because PostgreSQL clients can embed connection details.
      const code = typeof maybe?.code === 'string' && /^[A-Z0-9_]{1,20}$/.test(maybe.code)
        ? maybe.code : 'UNCLASSIFIED';
      const type = typeof maybe?.name === 'string' && /^[a-zA-Z]{1,40}$/.test(maybe.name)
        ? maybe.name : 'unknown';
      const detail = error instanceof Error ? error.message.toLowerCase() : '';
      const category = /certificate|self.signed|unable to verify|tls|ssl/.test(detail)
        ? 'tls'
        : /password|authenticat|invalid role|login|tenant|user not found/.test(detail)
          ? 'authentication'
          : /timeout|timed out|deadline/.test(detail)
            ? 'timeout'
            : /connect|terminated|socket|econn/.test(detail)
              ? 'connection'
              : /permission|not authorized|privilege/.test(detail)
                ? 'permissions'
                : 'other';
      console.warn('Base database readiness failed', { phase, code, type, category });
      throw new ServiceUnavailableException('SautiLink Base database not ready');
    }
  }
}

@Module({ controllers: [HealthController, PublicConfigController, BotsController, BotConfigController, MasterWebhookController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '16kb' });
  const origin = process.env.WEB_ORIGIN;
  if (origin) app.enableCors({ origin, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type'] });
  await app.listen(Number(process.env.PORT ?? 3001), '0.0.0.0');
  // Two independent flags are required for any external Telegram side effect.
  // Never auto-register a webhook just because code was deployed.
  if (process.env.MASTER_BOT_REGISTER_WEBHOOK === 'true') {
    await registerMasterWebhook(process.env);
    // No token, webhook secret, chat IDs, or update bodies in logs.
    console.info('SautiLink Base master Telegram webhook registration confirmed');
  }
}

void bootstrap();
