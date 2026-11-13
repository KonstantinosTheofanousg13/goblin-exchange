import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Runs against the real Postgres from docker-compose (`docker compose up -d`).
 * Uses its own region and item ids, and deletes them afterwards.
 */
describe('Database (e2e)', () => {
  const REGION = `test-${process.pid}`;
  const ITEM_ID = 900_000_000 + (process.pid % 1_000_000);
  const LAST_MODIFIED = new Date('2026-11-13T10:05:12.000Z');
  let prisma: PrismaService;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = await moduleRef.init();
    prisma = app.get(PrismaService);
    close = () => app.close();
  });

  afterAll(async () => {
    await prisma.snapshot.deleteMany({ where: { region: REGION } }); // cascades to prices
    await prisma.item.deleteMany({ where: { id: ITEM_ID } });
    await close();
  });

  it('stores a snapshot with item prices and reads BigInt prices back', async () => {
    await prisma.item.create({ data: { id: ITEM_ID } });
    const snapshot = await prisma.snapshot.create({
      data: {
        region: REGION,
        lastModified: LAST_MODIFIED,
        auctionCount: 5,
        prices: {
          create: {
            itemId: ITEM_ID,
            capturedAt: LAST_MODIFIED,
            minPrice: 1_250_000n,
            marketPrice: 100_000_000_000n, // 10M gold in copper: beyond 32-bit Int
            totalQuantity: 1235,
            listingCount: 3,
          },
        },
      },
    });

    const price = await prisma.itemPriceHourly.findUniqueOrThrow({
      where: { snapshotId_itemId: { snapshotId: snapshot.id, itemId: ITEM_ID } },
    });
    expect(price.minPrice).toBe(1_250_000n);
    expect(price.marketPrice).toBe(100_000_000_000n);
    expect(price.capturedAt.toISOString()).toBe(LAST_MODIFIED.toISOString());
  });

  it('rejects the same snapshot twice (idempotency constraint)', async () => {
    await expect(
      prisma.snapshot.create({
        data: { region: REGION, lastModified: LAST_MODIFIED, auctionCount: 5 },
      }),
    ).rejects.toMatchObject({ code: 'P2002' }); // unique constraint violation
  });
});
