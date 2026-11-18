import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import {
  COMMODITIES_BOOT_JOB_ID,
  COMMODITIES_POLL_INTERVAL_MS,
  COMMODITIES_SCHEDULER_ID,
  INGEST_COMMODITIES_JOB,
  INGESTION_QUEUE,
} from './ingestion.constants';

const JOB_OPTIONS: JobsOptions = {
  // Job-level retries on top of the HTTP-level ones in BlizzardClient:
  // these cover longer outages (Blizzard or our DB) at minute scale.
  attempts: 3,
  backoff: { type: 'exponential', delay: 60_000 },
  // Keep recent history in Redis for debugging, without growing forever.
  removeOnComplete: 100,
  removeOnFail: 500,
};

/**
 * Registers the recurring ingestion job in Redis on startup, and runs one ingestion now.
 * upsertJobScheduler is idempotent per id: every instance can call it on boot,
 * and there is still only one schedule (like Quartz with a clustered JobStore).
 * Only registered when INGESTION_ENABLED is true (see AppModule), and then the
 * env schema guarantees Blizzard credentials are set.
 */
@Injectable()
export class IngestionScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestionScheduler.name);

  constructor(@InjectQueue(INGESTION_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      COMMODITIES_SCHEDULER_ID,
      { every: COMMODITIES_POLL_INTERVAL_MS },
      { name: INGEST_COMMODITIES_JOB, opts: JOB_OPTIONS },
    );

    // Re-upserting an existing scheduler re-plans its next run for now + interval,
    // so after a restart nothing would run for up to 15 minutes (and a restart loop
    // would postpone ingestion indefinitely). Catch up with a one-off run instead.
    // The fixed jobId makes this a no-op while another instance's boot run is still
    // queued; removing it when done lets the next boot add it again. A run with no
    // new snapshot costs one 304 from Blizzard.
    await this.queue.add(
      INGEST_COMMODITIES_JOB,
      {},
      {
        ...JOB_OPTIONS,
        jobId: COMMODITIES_BOOT_JOB_ID,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    this.logger.log(
      `Commodities ingestion scheduled every ${COMMODITIES_POLL_INTERVAL_MS / 60_000} minutes, first run queued now`,
    );
  }
}
