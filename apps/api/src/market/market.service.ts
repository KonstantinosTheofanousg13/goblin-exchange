import { Inject, Injectable } from '@nestjs/common';
import { blizzardConfig, type BlizzardConfig } from '../config/blizzard.config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CandleInterval = 'hour' | 'day';
export type MoverWindow = '24h' | '7d';

/**
 * One OHLC candle of the market price. Buckets are UTC hours/days.
 * Prices in copper. `avgQuantity` (average listed quantity) stands in for volume:
 * the API shows what's listed, not what sold.
 */
export interface Candle {
  time: Date;
  open: bigint;
  high: bigint;
  low: bigint;
  close: bigint;
  avgQuantity: number;
  /** Snapshots in this bucket. */
  points: number;
}

export interface Mover {
  itemId: number;
  name: string | null;
  previousPrice: bigint;
  currentPrice: bigint;
  /** Percent change, e.g. 12.5 for +12.5%. A ratio, so a float is fine here (prices stay BigInt). */
  changePercent: number;
  totalQuantity: number;
}

export interface ListedItem {
  itemId: number;
  name: string | null;
  marketPrice: bigint;
  totalQuantity: number;
  listingCount: number;
}

export interface ItemSummary {
  itemId: number;
  name: string | null;
  capturedAt: Date;
  minPrice: bigint;
  marketPrice: bigint;
  totalQuantity: number;
  listingCount: number;
  /** null when there is no data that far back yet. */
  change24hPercent: number | null;
  change7dPercent: number | null;
}

const WINDOW_INTERVAL: Record<MoverWindow, string> = { '24h': '24 hours', '7d': '7 days' };

/**
 * Market analytics, computed at query time from item_price_hourly.
 * Everything is plain SQL ($queryRaw): window-style aggregation is where
 * Postgres shines and an ORM's query builder doesn't reach.
 */
export interface MarketStatus {
  snapshotAt: Date | null;
  fetchedAt: Date | null;
}

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(blizzardConfig.KEY) private readonly config: BlizzardConfig,
  ) {}

  /** OHLC candles of one item's market price in [from, to). */
  async getCandles(
    itemId: number,
    interval: CandleInterval,
    from: Date,
    to: Date,
  ): Promise<Candle[]> {
    return this.prisma.$queryRaw<Candle[]>`
      SELECT
        date_trunc(${interval}, p.captured_at, 'UTC')                    AS "time",
        (array_agg(p.market_price ORDER BY p.captured_at ASC))[1]        AS "open",
        MAX(p.market_price)                                              AS "high",
        MIN(p.market_price)                                              AS "low",
        (array_agg(p.market_price ORDER BY p.captured_at DESC))[1]       AS "close",
        ROUND(AVG(p.total_quantity))::int                                AS "avgQuantity",
        COUNT(*)::int                                                    AS "points"
      FROM item_price_hourly p
      JOIN snapshot s ON s.id = p.snapshot_id
      WHERE p.item_id = ${itemId}
        AND s.region = ${this.config.region}
        AND p.captured_at >= ${from}
        AND p.captured_at < ${to}
      GROUP BY 1
      ORDER BY 1`;
  }

  /**
   * Biggest market-price changes between the latest snapshot and the latest one
   * at least `window` older. Items with less than `minQuantity` listed are left out:
   * thinly listed items swing wildly and would crowd the list with noise.
   */
  async getTopMovers(options: {
    window: MoverWindow;
    direction: 'up' | 'down';
    limit: number;
    minQuantity: number;
  }): Promise<Mover[]> {
    const order = options.direction === 'up' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    return this.prisma.$queryRaw<Mover[]>`
      WITH latest AS (${this.latestSnapshot()}),
      base AS (${this.snapshotBefore(options.window)})
      SELECT
        cur.item_id                                               AS "itemId",
        i.name                                                    AS "name",
        prev.market_price                                         AS "previousPrice",
        cur.market_price                                          AS "currentPrice",
        ${changePercent(Prisma.sql`cur.market_price`, Prisma.sql`prev.market_price`)} AS "changePercent",
        cur.total_quantity                                        AS "totalQuantity"
      FROM item_price_hourly cur
      JOIN latest ON cur.snapshot_id = latest.id
      JOIN base ON TRUE
      JOIN item_price_hourly prev ON prev.snapshot_id = base.id AND prev.item_id = cur.item_id
      JOIN item i ON i.id = cur.item_id
      WHERE prev.market_price > 0
        AND cur.total_quantity >= ${options.minQuantity}
      ORDER BY "changePercent" ${order}, cur.item_id
      LIMIT ${options.limit}`;
  }

  /** Items with the most units listed in the latest snapshot. */
  async getMostListed(limit: number): Promise<ListedItem[]> {
    return this.prisma.$queryRaw<ListedItem[]>`
      WITH latest AS (${this.latestSnapshot()})
      SELECT
        p.item_id        AS "itemId",
        i.name           AS "name",
        p.market_price   AS "marketPrice",
        p.total_quantity AS "totalQuantity",
        p.listing_count  AS "listingCount"
      FROM item_price_hourly p
      JOIN latest ON p.snapshot_id = latest.id
      JOIN item i ON i.id = p.item_id
      ORDER BY p.total_quantity DESC, p.item_id
      LIMIT ${limit}`;
  }

  /** Latest prices of one item, with 24h and 7d change. null if the item has no data. */
  async getItemSummary(itemId: number): Promise<ItemSummary | null> {
    const rows = await this.prisma.$queryRaw<ItemSummary[]>`
      WITH cur AS (
        SELECT p.*
        FROM item_price_hourly p
        JOIN snapshot s ON s.id = p.snapshot_id
        WHERE p.item_id = ${itemId} AND s.region = ${this.config.region}
        ORDER BY p.captured_at DESC
        LIMIT 1
      )
      SELECT
        cur.item_id        AS "itemId",
        i.name             AS "name",
        cur.captured_at    AS "capturedAt",
        cur.min_price      AS "minPrice",
        cur.market_price   AS "marketPrice",
        cur.total_quantity AS "totalQuantity",
        cur.listing_count  AS "listingCount",
        ${changePercent(Prisma.sql`cur.market_price`, this.itemPriceBefore(itemId, '24h'))} AS "change24hPercent",
        ${changePercent(Prisma.sql`cur.market_price`, this.itemPriceBefore(itemId, '7d'))}  AS "change7dPercent"
      FROM cur
      JOIN item i ON i.id = cur.item_id`;
    return rows[0] ?? null;
  }

  /**
   * How fresh the data is: when Blizzard took the newest snapshot (its Last-Modified)
   * and when we fetched it. Null before the first ingestion.
   */
  async getStatus(): Promise<MarketStatus> {
    const latest = await this.prisma.snapshot.findFirst({
      where: { region: this.config.region },
      orderBy: { lastModified: 'desc' },
      select: { lastModified: true, fetchedAt: true },
    });
    return { snapshotAt: latest?.lastModified ?? null, fetchedAt: latest?.fetchedAt ?? null };
  }

  private latestSnapshot(): Prisma.Sql {
    return Prisma.sql`
      SELECT id, last_modified FROM snapshot
      WHERE region = ${this.config.region}
      ORDER BY last_modified DESC
      LIMIT 1`;
  }

  /** The newest snapshot at least `window` older than the latest one. */
  private snapshotBefore(window: MoverWindow): Prisma.Sql {
    return Prisma.sql`
      SELECT s.id FROM snapshot s, latest
      WHERE s.region = ${this.config.region}
        AND s.last_modified <= latest.last_modified - ${WINDOW_INTERVAL[window]}::interval
      ORDER BY s.last_modified DESC
      LIMIT 1`;
  }

  /** Scalar subquery: the item's market price at least `window` before its latest price (uses `cur`). */
  private itemPriceBefore(itemId: number, window: MoverWindow): Prisma.Sql {
    return Prisma.sql`(
      SELECT p.market_price
      FROM item_price_hourly p
      JOIN snapshot s ON s.id = p.snapshot_id
      WHERE p.item_id = ${itemId}
        AND s.region = ${this.config.region}
        AND p.captured_at <= cur.captured_at - ${WINDOW_INTERVAL[window]}::interval
      ORDER BY p.captured_at DESC
      LIMIT 1
    )`;
  }
}

/** (current - previous) / previous as a percentage with 2 decimals; NULL if previous is missing or 0. */
function changePercent(current: Prisma.Sql, previous: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`ROUND(((${current} - ${previous}) * 100.0 / NULLIF(${previous}, 0))::numeric, 2)::float8`;
}
