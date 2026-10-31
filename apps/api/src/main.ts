import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { BotsController } from './bots.controller';
import { BotConfigController } from './bot-config.controller';
import { MasterWebhookController } from './master-webhook.controller';

@Controller('health')
class HealthController {
  @Get()
  status() { return { status: 'ok', service: 'sautilink-base-api' }; }
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
