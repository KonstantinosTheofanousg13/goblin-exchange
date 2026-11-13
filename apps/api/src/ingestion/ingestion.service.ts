import { Inject, Injectable, Logger } from '@nestjs/common';
import { BlizzardClient } from '../blizzard/blizzard.client';
import { blizzardConfig, type BlizzardConfig } from '../config/blizzard.config';
import { PrismaService } from '../prisma/prisma.service';
import type { ItemAggregate } from './commodity-aggregator';
import { aggregateCommodityStream } from './commodity-stream';

/** Max rows per INSERT: 7 columns × 5,000 rows stays under Postgres's 65,535 bind parameters. */
const PRICE_BATCH_SIZE = 5_000;
/** Interactive transaction budget (Prisma's default is 5s). */
const TRANSACTION_TIMEOUT_MS = 60_000;

export type IngestionResult =
  /** Blizzard answered 304: no new snapshot since the last one. */
  | { status: 'not-modified' }
  /** Blizzard sent a snapshot we already have (it ignored If-Modified-Since). */
  | { status: 'unchanged'; lastModified: Date }
  /** Another run stored this snapshot first (unique constraint). */
  | { status: 'duplicate'; lastModified: Date }
  | {
      status: 'ingested';
      snapshotId: number;
      lastModified: Date;
      items: number;
      auctions: number;
      invalid: number;
    };

/**
 * One ingestion run: fetch → stream-aggregate → store, idempotent per snapshot.
 * Safe to run any number of times, concurrently or not.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blizzard: BlizzardClient,
    @Inject(blizzardConfig.KEY) private readonly config: BlizzardConfig,
  ) {}

  async ingestCommodities(): Promise<IngestionResult> {
    const region = this.config.region;
    const latest = await this.prisma.snapshot.findFirst({
      where: { region },
      orderBy: { lastModified: 'desc' },
      select: { lastModified: true },
    });

    const response = await this.blizzard.fetchCommodities(latest?.lastModified);
    if (response.status === 'not-modified') {
      this.logger.debug('No new commodities snapshot (304)');
      return { status: 'not-modified' };
    }

    const { lastModified, body } = response;
    if (latest && lastModified <= latest.lastModified) {
      body.destroy(); // don't download a snapshot we already have
      this.logger.debug(`Snapshot ${lastModified.toISOString()} already stored`);
      return { status: 'unchanged', lastModified };
    }

    const aggregate = await aggregateCommodityStream(body);
    if (aggregate.invalidCount > 0) {
      this.logger.warn(`Skipped ${aggregate.invalidCount} listings with an unexpected shape`);
    }

    let snapshotId: number;
    try {
      snapshotId = await this.store(region, lastModified, aggregate.auctionCount, aggregate.items);
    } catch (error) {
      if (isUniqueViolation(error)) {
        this.logger.log(`Snapshot ${lastModified.toISOString()} was stored by another run`);
        return { status: 'duplicate', lastModified };
      }
      throw error;
    }

    this.logger.log(
      `Ingested snapshot ${lastModified.toISOString()}: ${aggregate.items.length} items, ${aggregate.auctionCount} auctions`,
    );
    return {
      status: 'ingested',
      snapshotId,
      lastModified,
      items: aggregate.items.length,
      auctions: aggregate.auctionCount,
      invalid: aggregate.invalidCount,
    };
  }

  /** All-or-nothing: a snapshot row only exists if all its prices were stored. */
  private store(
    region: string,
    lastModified: Date,
    auctionCount: number,
    items: ItemAggregate[],
  ): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        // First, so a duplicate snapshot fails fast on the unique constraint.
        const snapshot = await tx.snapshot.create({
          data: { region, lastModified, auctionCount },
        });
        // New item ids get a bare row; ItemsModule fills in names later.
        await tx.item.createMany({
          data: items.map((item) => ({ id: item.itemId })),
          skipDuplicates: true,
        });
        for (let i = 0; i < items.length; i += PRICE_BATCH_SIZE) {
          await tx.itemPriceHourly.createMany({
            data: items.slice(i, i + PRICE_BATCH_SIZE).map((item) => ({
              snapshotId: snapshot.id,
              itemId: item.itemId,
              capturedAt: lastModified,
              minPrice: item.minPrice,
              marketPrice: item.marketPrice,
              totalQuantity: item.totalQuantity,
              listingCount: item.listingCount,
            })),
          });
        }
        return snapshot.id;
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  }
}

/** Prisma's unique-constraint error. Matched by code, not instanceof (see blizzard.resilience.ts). */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'P2002';
}
