import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  COMMODITIES_BOOT_JOB_ID,
  COMMODITIES_POLL_INTERVAL_MS,
  COMMODITIES_SCHEDULER_ID,
  INGEST_COMMODITIES_JOB,
  INGESTION_QUEUE,
} from './ingestion.constants';
import { IngestionScheduler } from './ingestion.scheduler';

describe('IngestionScheduler', () => {
  // A Mockito-style mock of the BullMQ queue: we only check what gets called.
  const queue = {
    upsertJobScheduler: jest.fn(),
    add: jest.fn(),
  };

  async function createScheduler() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        IngestionScheduler,
        { provide: getQueueToken(INGESTION_QUEUE), useValue: queue },
      ],
    }).compile();
    return moduleRef.get(IngestionScheduler);
  }

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('schedules the recurring ingestion job', async () => {
    const scheduler = await createScheduler();

    await scheduler.onApplicationBootstrap();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      COMMODITIES_SCHEDULER_ID,
      { every: COMMODITIES_POLL_INTERVAL_MS },
      expect.objectContaining({
        name: INGEST_COMMODITIES_JOB,
        opts: expect.objectContaining({ attempts: 3 }),
      }),
    );
  });

  it('queues a one-off run at boot, deduplicated by a fixed job id', async () => {
    const scheduler = await createScheduler();

    await scheduler.onApplicationBootstrap();

    expect(queue.add).toHaveBeenCalledWith(
      INGEST_COMMODITIES_JOB,
      {},
      expect.objectContaining({
        jobId: COMMODITIES_BOOT_JOB_ID,
        attempts: 3,
        removeOnComplete: true,
        removeOnFail: true,
      }),
    );
  });
});
