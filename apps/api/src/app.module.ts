import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ResilienceModule } from '@nestjs/resilience';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { blizzardConfig } from './config/blizzard.config';
import { type Env, envSchema } from './config/env.schema';
import { IngestionModule } from './ingestion/ingestion.module';
import { MarketModule } from './market/market.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // npm runs workspace scripts from apps/api, but .env lives at the repo root.
      envFilePath: ['.env', '../../.env'],
      validationSchema: envSchema,
      load: [blizzardConfig],
    }),
    // Global: lets any module create retry/timeout/circuit-breaker policies.
    ResilienceModule.forRoot(),
    // Shared Redis connection for every BullMQ queue and worker.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: { url: config.get('REDIS_URL', { infer: true }) },
        prefix: 'goblin',
      }),
    }),
    PrismaModule,
    IngestionModule,
    MarketModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
