import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BotsController } from './bots.controller';

@Controller('health')
class HealthController {
  @Get()
  status() { return { status: 'ok', service: 'sautilink-base-api' }; }
}

@Module({ controllers: [HealthController, BotsController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useBodyParser('json', { limit: '16kb' });
  const origin = process.env.WEB_ORIGIN;
  if (origin) app.enableCors({ origin, methods: ['POST', 'GET'], allowedHeaders: ['Authorization', 'Content-Type'] });
  await app.listen(Number(process.env.PORT ?? 3001), '0.0.0.0');
}

void bootstrap();
