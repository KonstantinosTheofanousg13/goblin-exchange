import { BullModule } from '@nestjs/bullmq';
import { Logger, Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule, ConfigService } from '@nestjs/config';
import { ResilienceModule } from '@nestjs/resilience';
import { blizzardConfig } from './config/blizzard.config';
import { type Env, envSchema, isIngestionEnabled } from './config/env.schema';
import { IngestionModule } from './ingestion/ingestion.module';
import { ItemsModule } from './items/items.module';
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
    // Like Spring's @ConditionalOnProperty: with INGESTION_ENABLED=false the module
    // (queue, scheduler and worker) isn't registered at all, so this instance never
    // touches the ingestion queue: it neither changes the schedule nor takes jobs.
    ConditionalModule.registerWhen(
      IngestionModule,
      (env) => {
        const enabled = isIngestionEnabled(env);
        if (!enabled) {
          new Logger('IngestionModule').warn(
            'INGESTION_ENABLED=false: commodities ingestion is not running on this instance',
          );
        }
        return enabled;
      },
      { debug: false },
    ),
    MarketModule,
    ItemsModule,
  ],
})
export class AppModule {}
