import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

@Controller('health')
class HealthController {
  @Get()
  status() { return { status: 'ok', service: 'sautilink-base-api' }; }
}

@Module({ controllers: [HealthController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(Number(process.env.PORT ?? 3001), '0.0.0.0');
}

void bootstrap();
