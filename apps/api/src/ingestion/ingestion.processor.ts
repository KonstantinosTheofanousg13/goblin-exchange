import { Processor, WorkerHost } from '@nestjs/bullmq';
import { type Job, UnrecoverableError } from 'bullmq';
import { INGEST_COMMODITIES_JOB, INGESTION_QUEUE } from './ingestion.constants';
import { type IngestionResult, IngestionService } from './ingestion.service';

/**
 * BullMQ worker for the ingestion queue (like a JMS listener / Camel consumer).
 * Concurrency 1: one run at a time per instance. Across instances, the snapshot
 * unique constraint keeps runs idempotent anyway.
 */
@Processor(INGESTION_QUEUE, { concurrency: 1 })
export class IngestionProcessor extends WorkerHost {
  constructor(private readonly ingestion: IngestionService) {
    super();
  }

  async process(job: Job): Promise<IngestionResult> {
    switch (job.name) {
      case INGEST_COMMODITIES_JOB:
        return this.ingestion.ingestCommodities();
      default:
        // Retrying won't help: don't burn attempts on it.
        throw new UnrecoverableError(`Unknown job: ${job.name}`);
    }
  }
}
