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
import { assertBotConnectConfigured } from './bot-connect-config';

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
        ip_quota_read: boolean;
        ip_quota_write: boolean;
        audit_insert: boolean;
        audit_update: boolean;
        browser_forbidden_ip_quota: boolean;
        browser_forbidden_audit: boolean;
        bot_insert: boolean;
        credential_insert: boolean;
        account_quota_read: boolean;
        account_quota_write: boolean;
        audit_read: boolean;
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
        has_column_privilege('authenticated', 'base_private.master_update_ledger', 'update_id', 'SELECT') as browser_forbidden_read_id,
        has_table_privilege(current_user, 'base_private.bot_connect_ip_limits', 'SELECT') as ip_quota_read,
        has_table_privilege(current_user, 'base_private.bot_connect_ip_limits', 'INSERT') and
          has_table_privilege(current_user, 'base_private.bot_connect_ip_limits', 'UPDATE') as ip_quota_write,
        has_table_privilege(current_user, 'base_private.bot_connect_audit', 'INSERT') as audit_insert,
        has_table_privilege(current_user, 'base_private.bot_connect_audit', 'UPDATE') as audit_update,
        has_table_privilege('authenticated', 'base_private.bot_connect_ip_limits', 'SELECT') as browser_forbidden_ip_quota,
        has_table_privilege('authenticated', 'base_private.bot_connect_audit', 'SELECT') as browser_forbidden_audit,
        has_column_privilege(current_user, 'public.base_bots', 'owner_id', 'INSERT') and
          has_column_privilege(current_user, 'public.base_bots', 'telegram_bot_id', 'INSERT') and
          has_column_privilege(current_user, 'public.base_bots', 'username', 'INSERT') and
          has_column_privilege(current_user, 'public.base_bots', 'display_name', 'INSERT') as bot_insert,
        has_column_privilege(current_user, 'base_private.bot_credentials', 'bot_id', 'INSERT') and
          has_column_privilege(current_user, 'base_private.bot_credentials', 'key_version', 'INSERT') as credential_insert,
        has_table_privilege(current_user, 'base_private.bot_connect_limits', 'SELECT') as account_quota_read,
        has_table_privilege(current_user, 'base_private.bot_connect_limits', 'INSERT') and
          has_table_privilege(current_user, 'base_private.bot_connect_limits', 'UPDATE') as account_quota_write,
        has_table_privilege(current_user, 'base_private.bot_connect_audit', 'SELECT') as audit_read`);
      const state = result.rows[0];
      phase = 'permissions';
      const connectionPermissionsOk = state?.bot_insert && state.credential_insert &&
        state.account_quota_read && state.account_quota_write && state.audit_read;
      if (!state || !state.role_ok || !state.inherited || !state.bots_access || !state.secret_write || state.secret_read ||
        !state.ledger_read_id || !state.ledger_insert_id || !state.ledger_insert_status ||
        !state.ledger_update_status || state.ledger_forbidden_read_status || state.browser_forbidden_read_id ||
        !state.ip_quota_read || !state.ip_quota_write || !state.audit_insert || !state.audit_update ||
        state.browser_forbidden_ip_quota || state.browser_forbidden_audit ||
        (process.env.BOT_CONNECT_ENABLED === 'true' && !connectionPermissionsOk)) {
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
          browserCanReadLedger: state?.browser_forbidden_read_id === true,
          ipQuotaRead: state?.ip_quota_read === true,
          ipQuotaWrite: state?.ip_quota_write === true,
          botAuditInsert: state?.audit_insert === true,
          botAuditUpdate: state?.audit_update === true,
          browserCanReadIpQuota: state?.browser_forbidden_ip_quota === true,
          browserCanReadAudit: state?.browser_forbidden_audit === true,
          botInsert: state?.bot_insert === true,
          credentialInsert: state?.credential_insert === true,
          accountQuotaRead: state?.account_quota_read === true,
          accountQuotaWrite: state?.account_quota_write === true,
          auditRead: state?.audit_read === true
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
  // A misconfigured opt-in must fail before the API accepts any bot token.
  assertBotConnectConfigured(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Render's load balancer is the ONE trusted ingress hop. Never trust an
  // arbitrary X-Forwarded-For chain (which a client can prepend/spoof).
  // Express req.ip uses the rightmost forwarded address from this one hop.
  app.set('trust proxy', 1);
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
