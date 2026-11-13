import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  blizzardConfig,
  type BlizzardConfig,
} from '../src/config/blizzard.config';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The HTTP API end to end: the full AppModule with the production setup (prefix,
 * validation, Swagger), over real HTTP (supertest), on seeded Postgres data.
 */
describe('REST API (e2e)', () => {
  const REGION = `test-${process.pid}`;
  const BASE_ID = 930_000_000 + (process.pid % 1_000_000) * 10;
  const [HERB, ORE] = [BASE_ID, BASE_ID + 1];
  const TAG = `zz${process.pid}`; // unique text so name search only finds our items
  const CLASS = 999; // a class id no seeded or real item uses, so category filters only find our items

  let app: INestApplication<App>;
  let prisma: PrismaService;

  async function seedSnapshot(
    at: string,
    prices: Record<number, [number, number]>,
  ) {
    const capturedAt = new Date(at);
    await prisma.snapshot.create({
      data: {
        region: REGION,
        lastModified: capturedAt,
        auctionCount: 1,
        prices: {
          create: Object.entries(prices).map(([id, [price, quantity]]) => ({
            itemId: Number(id),
            capturedAt,
            minPrice: BigInt(price),
            marketPrice: BigInt(price),
            totalQuantity: quantity,
            listingCount: 3,
          })),
        },
      },
    });
  }

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Own region; no credentials, so the ingestion scheduler stays off.
      .overrideProvider(blizzardConfig.KEY)
      .useValue({ region: REGION } as unknown as BlizzardConfig)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.item.createMany({
      data: [
        {
          id: HERB,
          name: `Mycobloom ${TAG}`,
          quality: 'COMMON',
          classId: CLASS,
          subclassId: 9,
        },
        {
          id: ORE,
          name: `Bismuth ${TAG}`,
          quality: 'COMMON',
          classId: CLASS,
          subclassId: 7,
        },
      ],
    });
    // A huge price, to prove it survives as a string: 10M gold = 10^11 copper.
    await seedSnapshot('2026-11-12T09:00:00Z', {
      [HERB]: [100_000_000_000, 500],
      [ORE]: [1000, 200],
    });
    await seedSnapshot('2026-11-13T10:00:00Z', {
      [HERB]: [110_000_000_000, 600],
      [ORE]: [800, 300],
    });
  });

  afterAll(async () => {
    await prisma.snapshot.deleteMany({ where: { region: REGION } });
    await prisma.item.deleteMany({ where: { id: { in: [HERB, ORE] } } });
    await app.close();
    jest.restoreAllMocks();
  });

  const http = () => request(app.getHttpServer());

  describe('GET /api/items', () => {
    it('searches items by name, case-insensitively', async () => {
      const res = await http()
        .get('/api/items')
        .query({ search: TAG.toUpperCase() })
        .expect(200);

      expect(res.body).toEqual([
        {
          id: ORE,
          name: `Bismuth ${TAG}`,
          icon: null,
          quality: 'COMMON',
          classId: CLASS,
          subclassId: 7,
        },
        {
          id: HERB,
          name: `Mycobloom ${TAG}`,
          icon: null,
          quality: 'COMMON',
          classId: CLASS,
          subclassId: 9,
        },
      ]);
    });

    it('lists a whole category without a search term', async () => {
      const res = await http()
        .get('/api/items')
        .query({ classId: CLASS })
        .expect(200);

      expect(res.body.map((i: { id: number }) => i.id)).toEqual([ORE, HERB]);
    });

    it('narrows to a subcategory', async () => {
      const res = await http()
        .get('/api/items')
        .query({ classId: CLASS, subclassId: 9 })
        .expect(200);

      expect(res.body.map((i: { id: number }) => i.id)).toEqual([HERB]);
    });

    it('combines a search term with a category', async () => {
      const res = await http()
        .get('/api/items')
        .query({ search: 'bismuth', classId: CLASS })
        .expect(200);

      expect(res.body.map((i: { id: number }) => i.id)).toEqual([ORE]);
    });

    it('rejects a request with neither a search term nor a category', async () => {
      const res = await http().get('/api/items').expect(400);

      expect(res.body.message).toEqual(['search or classId is required']);
    });

    it('rejects a subclass without its class', async () => {
      const res = await http()
        .get('/api/items')
        .query({ subclassId: 9 })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining(['subclassId: subclassId requires classId']),
      );
    });

    it('rejects a too-short search term with a 400 explaining why', async () => {
      const res = await http()
        .get('/api/items')
        .query({ search: 'a' })
        .expect(400);

      expect(res.body.message).toEqual([expect.stringMatching(/^search: /)]);
    });
  });

  describe('GET /api/items/categories', () => {
    it('returns the category tree (and is not mistaken for an item id)', async () => {
      const res = await http().get('/api/items/categories').expect(200);

      const tradeGoods = res.body.find(
        (c: { classId: number }) => c.classId === 7,
      );
      expect(tradeGoods.name).toBe('Trade Goods');
      expect(tradeGoods.subcategories).toContainEqual({
        subclassId: 9,
        name: 'Herb',
      });
    });
  });

  describe('GET /api/items/:id', () => {
    it('returns the summary with prices as strings', async () => {
      const res = await http().get(`/api/items/${HERB}`).expect(200);

      expect(res.body).toEqual({
        itemId: HERB,
        name: `Mycobloom ${TAG}`,
        capturedAt: '2026-11-13T10:00:00.000Z',
        minPrice: '110000000000',
        marketPrice: '110000000000',
        totalQuantity: 600,
        listingCount: 3,
        change24hPercent: 10,
        change7dPercent: null,
      });
    });

    it('returns 404 for an item without price data', async () => {
      await http().get('/api/items/999999999').expect(404);
    });

    it('returns 400 for a non-numeric id', async () => {
      const res = await http().get('/api/items/abc').expect(400);

      expect(res.body.message).toEqual(['id must be a positive integer']);
    });
  });

  describe('GET /api/items/:id/candles', () => {
    it('returns daily candles with string prices', async () => {
      const res = await http()
        .get(`/api/items/${ORE}/candles`)
        .query({
          interval: 'day',
          from: '2026-11-12T00:00:00Z',
          to: '2026-11-14T00:00:00Z',
        })
        .expect(200);

      expect(res.body).toEqual({
        itemId: ORE,
        interval: 'day',
        from: '2026-11-12T00:00:00.000Z',
        to: '2026-11-14T00:00:00.000Z',
        candles: [
          {
            time: '2026-11-12T00:00:00.000Z',
            open: '1000',
            high: '1000',
            low: '1000',
            close: '1000',
            avgQuantity: 200,
            points: 1,
          },
          {
            time: '2026-11-13T00:00:00.000Z',
            open: '800',
            high: '800',
            low: '800',
            close: '800',
            avgQuantity: 300,
            points: 1,
          },
        ],
      });
    });

    it('defaults to the last 90 days of daily candles', async () => {
      const res = await http().get(`/api/items/${ORE}/candles`).expect(200);

      const span = Date.parse(res.body.to) - Date.parse(res.body.from);
      expect(res.body.interval).toBe('day');
      expect(span).toBe(90 * 24 * 60 * 60 * 1000);
    });

    it.each([
      ['an unknown interval', { interval: 'week' }, /^interval: /],
      ['an invalid date', { from: 'yesterday' }, /^from: /],
      [
        'from after to',
        { from: '2026-11-13T00:00:00Z', to: '2026-11-12T00:00:00Z' },
        /^from: must be before to/,
      ],
      [
        'a range too large',
        {
          interval: 'hour',
          from: '2026-01-01T00:00:00Z',
          to: '2026-11-01T00:00:00Z',
        },
        /^from: range too large/,
      ],
    ])('rejects %s with a 400', async (_case, query, message) => {
      const res = await http()
        .get(`/api/items/${ORE}/candles`)
        .query(query)
        .expect(400);

      expect(res.body.message).toEqual([expect.stringMatching(message)]);
    });
  });

  describe('GET /api/market', () => {
    it('lists movers with defaults (24h, up, minQuantity 100)', async () => {
      const res = await http().get('/api/market/movers').expect(200);

      expect(res.body).toEqual([
        {
          itemId: HERB,
          name: `Mycobloom ${TAG}`,
          previousPrice: '100000000000',
          currentPrice: '110000000000',
          changePercent: 10,
          totalQuantity: 600,
        },
        expect.objectContaining({ itemId: ORE, changePercent: -20 }),
      ]);
    });

    it('lists fallers for direction=down', async () => {
      const res = await http()
        .get('/api/market/movers')
        .query({ direction: 'down', limit: 1 })
        .expect(200);

      expect(res.body).toEqual([
        expect.objectContaining({ itemId: ORE, changePercent: -20 }),
      ]);
    });

    it('lists the most listed items', async () => {
      const res = await http()
        .get('/api/market/most-listed')
        .query({ limit: 1 })
        .expect(200);

      expect(res.body).toEqual([
        {
          itemId: HERB,
          name: `Mycobloom ${TAG}`,
          marketPrice: '110000000000',
          totalQuantity: 600,
          listingCount: 3,
        },
      ]);
    });

    it('rejects an out-of-range limit', async () => {
      await http().get('/api/market/movers').query({ limit: 500 }).expect(400);
    });
  });

  describe('OpenAPI document', () => {
    it('documents every endpoint with its query parameters', async () => {
      const res = await http().get('/docs-json').expect(200);
      const paths = res.body.paths;

      expect(Object.keys(paths).sort()).toEqual([
        '/api/items',
        '/api/items/categories',
        '/api/items/{id}',
        '/api/items/{id}/candles',
        '/api/market/most-listed',
        '/api/market/movers',
      ]);
      const candleParams = paths['/api/items/{id}/candles'].get.parameters.map(
        (p: { name: string }) => p.name,
      );
      expect(candleParams).toEqual(
        expect.arrayContaining(['id', 'interval', 'from', 'to']),
      );
    });
  });
});
