import type { Job } from 'bullmq';
import { INGEST_COMMODITIES_JOB } from './ingestion.constants';
import { IngestionProcessor } from './ingestion.processor';
import type { IngestionService } from './ingestion.service';

describe('IngestionProcessor', () => {
  // Plain constructor injection with a mock: no Nest container needed for this one.
  const ingestion = { ingestCommodities: jest.fn() };
  const processor = new IngestionProcessor(ingestion as unknown as IngestionService);

  it('runs commodities ingestion for its job', async () => {
    ingestion.ingestCommodities.mockResolvedValue({ status: 'not-modified' });

    await expect(
      processor.process({ name: INGEST_COMMODITIES_JOB } as Job),
    ).resolves.toEqual({ status: 'not-modified' });
  });

  it('fails unknown jobs without retrying', async () => {
    await expect(processor.process({ name: 'something-else' } as Job)).rejects.toMatchObject({
      name: 'UnrecoverableError',
    });
  });
});
