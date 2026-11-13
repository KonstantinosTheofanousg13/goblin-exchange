import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { blizzardConfig, type BlizzardConfig } from '../src/config/blizzard.config';
import { envSchema } from '../src/config/env.schema';
import { MarketModule } from '../src/market/market.module';
import { MarketService } from '../src/market/market.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Market queries against the real Postgres, on hand-made snapshots.
 * Own region and item ids, cleaned up before and after.
 */
describe('Market (e2e)', () => {
  const REGION = `test-${process.pid}`;
  const BASE_ID = 920_000_000 + (process.pid % 1_000_000) * 10;
  const [A, B, C, D] = [BASE_ID, BASE_ID + 1, BASE_ID + 2, BASE_ID + 3];

  let prisma: PrismaService;
  let market: MarketService;
  let close: () => Promise<void>;

  /** Prices per item: [marketPrice, totalQuantity]. minPrice = marketPrice - 1. */
  async function seedSnapshot(at: string, prices: Record<number, [number, number]>) {
    const capturedAt = new Date(at);
    await prisma.item.createMany({
      data: Object.keys(prices).map((id) => ({ id: Number(id), name: `Item ${id}` })),
      skipDuplicates: true,
    });
    await prisma.snapshot.create({
      data: {
        region: REGION,
        lastModified: capturedAt,
        auctionCount: 1,
        prices: {
          create: Object.entries(prices).map(([id, [price, quantity]]) => ({
            itemId: Number(id),
            capturedAt,
            minPrice: BigInt(price - 1),
            marketPrice: BigInt(price),
            totalQuantity: quantity,
            listingCount: 1,
          })),
        },
      },
    });
  }

  async function cleanUp() {
    await prisma.snapshot.deleteMany({ where: { region: REGION } });
    await prisma.item.deleteMany({ where: { id: { in: [A, B, C, D] } } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env', '../../.env'],
          validationSchema: envSchema,
          load: [blizzardConfig],
        }),
        PrismaModule,
        MarketModule,
      ],
    })
      .overrideProvider(blizzardConfig.KEY)
      .useValue({ region: REGION } as unknown as BlizzardConfig)
      .compile();
    const app = await moduleRef.init();
    prisma = app.get(PrismaService);
    market = app.get(MarketService);
    close = () => app.close();
  });

  beforeEach(cleanUp);

  afterAll(async () => {
    await cleanUp();
    await close();
  });

  describe('getCandles', () => {
    beforeEach(async () => {
      // Day 1 (UTC): 100 → 150 → 120. 23:30Z still belongs to day 1.
      await seedSnapshot('2026-11-10T01:00:00Z', { [A]: [100, 10] });
      await seedSnapshot('2026-11-10T12:00:00Z', { [A]: [150, 20] });
      await seedSnapshot('2026-11-10T23:30:00Z', { [A]: [120, 30] });
      // Day 2: 90 → 110
      await seedSnapshot('2026-11-11T00:30:00Z', { [A]: [90, 40] });
      await seedSnapshot('2026-11-11T09:00:00Z', { [A]: [110, 50] });
    });

    it('builds daily OHLC candles in UTC', async () => {
      const candles = await market.getCandles(
        A,
        'day',
        new Date('2026-11-01T00:00:00Z'),
        new Date('2026-12-01T00:00:00Z'),
      );

      expect(candles).toEqual([
        {
          time: new Date('2026-11-10T00:00:00Z'),
          open: 100n,
          high: 150n,
          low: 100n,
          close: 120n,
          avgQuantity: 20,
          points: 3,
        },
        {
          time: new Date('2026-11-11T00:00:00Z'),
          open: 90n,
          high: 110n,
          low: 90n,
          close: 110n,
          avgQuantity: 45, // (40 + 50) / 2
          points: 2,
        },
      ]);
    });

    it('builds hourly candles and respects the [from, to) range', async () => {
      const candles = await market.getCandles(
        A,
        'hour',
        new Date('2026-11-10T12:00:00Z'),
        new Date('2026-11-11T00:30:00Z'), // exclusive: the 00:30 snapshot is left out
      );

      expect(candles.map((c) => [c.time.toISOString(), c.close])).toEqual([
        ['2026-11-10T12:00:00.000Z', 150n],
        ['2026-11-10T23:00:00.000Z', 120n],
      ]);
    });
  });

  describe('getTopMovers', () => {
    beforeEach(async () => {
      // 8 days ago, 25 hours ago, and now (relative to the latest snapshot).
      await seedSnapshot('2026-11-05T10:00:00Z', { [A]: [50, 100], [B]: [500, 100] });
      await seedSnapshot('2026-11-12T09:00:00Z', {
        [A]: [100, 100],
        [B]: [500, 100],
        [C]: [100, 2],
      });
      await seedSnapshot('2026-11-12T20:00:00Z', { [A]: [999, 100] }); // only 14h old: not a 24h base
      await seedSnapshot('2026-11-13T10:00:00Z', {
        [A]: [150, 100], // +50% over 24h, +200% over 7d
        [B]: [400, 100], // -20%
        [C]: [110, 2], // +10%, but thinly listed
        [D]: [10, 100], // new item: no base price
      });
    });

    it('ranks risers over 24h, leaving out thinly listed and new items', async () => {
      const movers = await market.getTopMovers({
        window: '24h',
        direction: 'up',
        limit: 10,
        minQuantity: 10,
      });

      expect(movers).toEqual([
        {
          itemId: A,
          name: `Item ${A}`,
          previousPrice: 100n,
          currentPrice: 150n,
          changePercent: 50,
          totalQuantity: 100,
        },
        expect.objectContaining({ itemId: B, changePercent: -20 }),
      ]);
    });

    it('ranks fallers first for direction "down"', async () => {
      const movers = await market.getTopMovers({
        window: '24h',
        direction: 'down',
        limit: 1,
        minQuantity: 0,
      });

      expect(movers).toEqual([expect.objectContaining({ itemId: B, changePercent: -20 })]);
    });

    it('includes thinly listed items when minQuantity allows it', async () => {
      const movers = await market.getTopMovers({
        window: '24h',
        direction: 'up',
        limit: 10,
        minQuantity: 0,
      });

      expect(movers.map((m) => m.itemId)).toEqual([A, C, B]);
    });

    it('uses the 7d base snapshot for the 7d window', async () => {
      const [top] = await market.getTopMovers({
        window: '7d',
        direction: 'up',
        limit: 1,
        minQuantity: 0,
      });

      expect(top).toMatchObject({ itemId: A, previousPrice: 50n, changePercent: 200 });
    });

    it('returns nothing until there is data that far back', async () => {
      await cleanUp();
      await seedSnapshot('2026-11-13T10:00:00Z', { [A]: [150, 100] });

      await expect(
        market.getTopMovers({ window: '24h', direction: 'up', limit: 10, minQuantity: 0 }),
      ).resolves.toEqual([]);
    });
  });

  describe('getMostListed', () => {
    it('ranks items in the latest snapshot by listed quantity', async () => {
      await seedSnapshot('2026-11-12T10:00:00Z', { [A]: [1, 999_999] }); // older: ignored
      await seedSnapshot('2026-11-13T10:00:00Z', { [A]: [100, 5], [B]: [200, 50], [C]: [300, 20] });

      const listed = await market.getMostListed(2);

      expect(listed).toEqual([
        { itemId: B, name: `Item ${B}`, marketPrice: 200n, totalQuantity: 50, listingCount: 1 },
        expect.objectContaining({ itemId: C, totalQuantity: 20 }),
      ]);
    });
  });

  describe('getItemSummary', () => {
    it('returns the latest prices with 24h and 7d change', async () => {
      await seedSnapshot('2026-11-05T10:00:00Z', { [A]: [80, 10] });
      await seedSnapshot('2026-11-12T09:00:00Z', { [A]: [100, 10] });
      await seedSnapshot('2026-11-13T10:00:00Z', { [A]: [120, 30] });

      await expect(market.getItemSummary(A)).resolves.toEqual({
        itemId: A,
        name: `Item ${A}`,
        capturedAt: new Date('2026-11-13T10:00:00Z'),
        minPrice: 119n,
        marketPrice: 120n,
        totalQuantity: 30,
        listingCount: 1,
        change24hPercent: 20,
        change7dPercent: 50,
      });
    });

    it('reports null changes when there is no older data', async () => {
      await seedSnapshot('2026-11-13T10:00:00Z', { [A]: [120, 30] });

      await expect(market.getItemSummary(A)).resolves.toMatchObject({
        change24hPercent: null,
        change7dPercent: null,
      });
    });

    it('returns null for an item without data', async () => {
      await expect(market.getItemSummary(D)).resolves.toBeNull();
    });
  });
});
