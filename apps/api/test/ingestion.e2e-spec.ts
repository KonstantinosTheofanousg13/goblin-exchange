import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ResilienceModule } from '@nestjs/resilience';
import { Test } from '@nestjs/testing';
import { BlizzardModule } from '../src/blizzard/blizzard.module';
import { BLIZZARD_RESILIENCE_OPTIONS } from '../src/blizzard/blizzard.resilience';
import { blizzardConfig, type BlizzardConfig } from '../src/config/blizzard.config';
import { envSchema } from '../src/config/env.schema';
import { IngestionService } from '../src/ingestion/ingestion.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakeHttpServer } from './support/fake-http-server';

/**
 * Full ingestion run: fake Blizzard (local HTTP server) → real stream parsing →
 * real Postgres from docker-compose. Uses its own region and item ids, cleaned up after.
 */
describe('Ingestion (e2e)', () => {
  const REGION = `test-${process.pid}`;
  const ITEM_A = 910_000_000 + (process.pid % 1_000_000) * 2;
  const ITEM_B = ITEM_A + 1;
  const LM1 = new Date('2026-11-13T10:05:12Z');
  const LM2 = new Date('2026-11-13T11:04:58Z');

  let blizzard: FakeHttpServer;
  let prisma: PrismaService;
  let ingestion: IngestionService;
  let close: () => Promise<void>;

  const token = () => ({ status: 200, body: { access_token: 'token', expires_in: 3600 } });
  const snapshot = (lastModified: Date) => ({
    status: 200,
    headers: { 'Last-Modified': lastModified.toUTCString() },
    body: JSON.stringify({
      auctions: [
        { id: 1, item: { id: ITEM_A }, quantity: 10, unit_price: 1000, time_left: 'LONG' },
        { id: 2, item: { id: ITEM_A }, quantity: 10, unit_price: 2000, time_left: 'SHORT' },
        { id: 3, item: { id: ITEM_B }, quantity: 5, unit_price: 50, time_left: 'LONG' },
      ],
    }),
  });

  async function cleanUp() {
    await prisma.snapshot.deleteMany({ where: { region: REGION } }); // cascades to prices
    await prisma.item.deleteMany({ where: { id: { in: [ITEM_A, ITEM_B] } } });
  }

  beforeEach(async () => {
    blizzard = new FakeHttpServer();
    await blizzard.start();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const config: BlizzardConfig = {
      clientId: 'test-client',
      clientSecret: 'test-secret',
      region: REGION as BlizzardConfig['region'],
      oauthTokenUrl: `${blizzard.baseUrl}/token`,
      apiBaseUrl: blizzard.baseUrl,
    };
    // The pieces IngestionService needs, without BullMQ: no schedulers or workers in this test.
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env', '../../.env'],
          validationSchema: envSchema,
          load: [blizzardConfig],
        }),
        ResilienceModule.forRoot(),
        PrismaModule,
        BlizzardModule,
      ],
      providers: [IngestionService],
    })
      .overrideProvider(blizzardConfig.KEY)
      .useValue(config)
      .overrideProvider(BLIZZARD_RESILIENCE_OPTIONS)
      .useValue({ retry: false })
      .compile();
    const app = await moduleRef.init();
    prisma = app.get(PrismaService);
    ingestion = app.get(IngestionService);
    close = () => app.close();
    await cleanUp();
  });

  afterEach(async () => {
    await cleanUp();
    await close();
    await blizzard.stop();
    jest.restoreAllMocks();
  });

  it('stores a new snapshot with its items and prices', async () => {
    blizzard.enqueue(token(), snapshot(LM1));

    const result = await ingestion.ingestCommodities();

    expect(result).toMatchObject({ status: 'ingested', items: 2, auctions: 3, invalid: 0 });
    const stored = await prisma.snapshot.findFirstOrThrow({
      where: { region: REGION },
      include: { prices: { orderBy: { itemId: 'asc' } } },
    });
    expect(stored.lastModified).toEqual(LM1);
    expect(stored.auctionCount).toBe(3);
    expect(stored.prices).toEqual([
      expect.objectContaining({
        itemId: ITEM_A,
        capturedAt: LM1,
        minPrice: 1000n,
        marketPrice: 1000n, // 15% of 20 = 3 units, all at 1000
        totalQuantity: 20,
        listingCount: 2,
      }),
      expect.objectContaining({ itemId: ITEM_B, minPrice: 50n, marketPrice: 50n }),
    ]);
  });

  it('sends If-Modified-Since on the next run and stops on 304', async () => {
    blizzard.enqueue(token(), snapshot(LM1), { status: 304 });
    await ingestion.ingestCommodities();

    const result = await ingestion.ingestCommodities();

    expect(result).toEqual({ status: 'not-modified' });
    expect(blizzard.requests.at(-1)?.headers['if-modified-since']).toBe(LM1.toUTCString());
    expect(await prisma.snapshot.count({ where: { region: REGION } })).toBe(1);
  });

  it('skips a snapshot it already has, even if Blizzard ignores If-Modified-Since', async () => {
    blizzard.enqueue(token(), snapshot(LM1), snapshot(LM1));
    await ingestion.ingestCommodities();

    const result = await ingestion.ingestCommodities();

    expect(result).toEqual({ status: 'unchanged', lastModified: LM1 });
    expect(await prisma.snapshot.count({ where: { region: REGION } })).toBe(1);
  });

  it('adds prices for a newer snapshot and reuses existing items', async () => {
    blizzard.enqueue(token(), snapshot(LM1), snapshot(LM2));
    await ingestion.ingestCommodities();

    const result = await ingestion.ingestCommodities();

    expect(result).toMatchObject({ status: 'ingested', lastModified: LM2 });
    expect(await prisma.snapshot.count({ where: { region: REGION } })).toBe(2);
    expect(await prisma.item.count({ where: { id: { in: [ITEM_A, ITEM_B] } } })).toBe(2);
    expect(await prisma.itemPriceHourly.count({ where: { snapshot: { region: REGION } } })).toBe(4);
  });

  it('stores a snapshot only once when two runs race', async () => {
    blizzard.enqueue(token(), snapshot(LM1), snapshot(LM1));

    const results = await Promise.all([
      ingestion.ingestCommodities(),
      ingestion.ingestCommodities(),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual(['duplicate', 'ingested']);
    expect(await prisma.snapshot.count({ where: { region: REGION } })).toBe(1);
    expect(await prisma.itemPriceHourly.count({ where: { snapshot: { region: REGION } } })).toBe(2);
  });
});
