import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.schema';
import { PrismaClient } from '../generated/prisma/client';

/**
 * The database client as an injectable singleton (like Spring's DataSource/EntityManager bean).
 * Prisma 7 talks to Postgres through the standard `pg` driver via a driver adapter.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
      }),
    });
  }

  /** Connect at startup, so a wrong DATABASE_URL fails the boot instead of the first query. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Close the pool on shutdown (requires app.enableShutdownHooks() for SIGTERM). */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
