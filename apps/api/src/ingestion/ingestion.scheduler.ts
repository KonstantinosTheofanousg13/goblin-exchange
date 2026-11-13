import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { blizzardConfig, type BlizzardConfig } from '../config/blizzard.config';
import {
  COMMODITIES_POLL_INTERVAL_MS,
  COMMODITIES_SCHEDULER_ID,
  INGEST_COMMODITIES_JOB,
  INGESTION_QUEUE,
} from './ingestion.constants';

/**
 * Registers the recurring ingestion job in Redis on startup.
 * upsertJobScheduler is idempotent per id: every instance can call it on boot,
 * and there is still only one schedule (like Quartz with a clustered JobStore).
 */
@Injectable()
export class IngestionScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestionScheduler.name);

  constructor(
    @InjectQueue(INGESTION_QUEUE) private readonly queue: Queue,
    @Inject(blizzardConfig.KEY) private readonly config: BlizzardConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.clientId || !this.config.clientSecret) {
      // Every run would fail without credentials: don't schedule, and drop a stale schedule.
      await this.queue.removeJobScheduler(COMMODITIES_SCHEDULER_ID);
      this.logger.warn('Blizzard credentials not configured: commodities ingestion is not scheduled');
      return;
    }

    await this.queue.upsertJobScheduler(
      COMMODITIES_SCHEDULER_ID,
      { every: COMMODITIES_POLL_INTERVAL_MS },
      {
        name: INGEST_COMMODITIES_JOB,
        opts: {
          // Job-level retries on top of the HTTP-level ones in BlizzardClient:
          // these cover longer outages (Blizzard or our DB) at minute scale.
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
          // Keep recent history in Redis for debugging, without growing forever.
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
    );
    this.logger.log(
      `Commodities ingestion scheduled every ${COMMODITIES_POLL_INTERVAL_MS / 60_000} minutes`,
    );
  }
}
