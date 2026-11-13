import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { blizzardConfig, type BlizzardConfig } from '../config/blizzard.config';
import {
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
    removeJobScheduler: jest.fn(),
  };

  async function createScheduler(credentials: Partial<BlizzardConfig>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        IngestionScheduler,
        { provide: getQueueToken(INGESTION_QUEUE), useValue: queue },
        { provide: blizzardConfig.KEY, useValue: { region: 'eu', ...credentials } },
      ],
    }).compile();
    return moduleRef.get(IngestionScheduler);
  }

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('schedules the ingestion job when credentials are configured', async () => {
    const scheduler = await createScheduler({ clientId: 'id', clientSecret: 'secret' });

    await scheduler.onApplicationBootstrap();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      COMMODITIES_SCHEDULER_ID,
      { every: COMMODITIES_POLL_INTERVAL_MS },
      expect.objectContaining({
        name: INGEST_COMMODITIES_JOB,
        opts: expect.objectContaining({ attempts: 3 }),
      }),
    );
    expect(queue.removeJobScheduler).not.toHaveBeenCalled();
  });

  it('does not schedule (and removes a stale schedule) without credentials', async () => {
    const scheduler = await createScheduler({});

    await scheduler.onApplicationBootstrap();

    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(COMMODITIES_SCHEDULER_ID);
  });
});
