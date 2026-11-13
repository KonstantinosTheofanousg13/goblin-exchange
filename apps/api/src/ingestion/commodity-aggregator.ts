import { z } from 'zod';

/** Market price = average unit price of the cheapest this-many percent of listed quantity. */
export const MARKET_DEPTH_PERCENT = 15;

/** One listing as Blizzard sends it (extra fields are ignored). */
const listingSchema = z.object({
  item: z.object({ id: z.number().int().positive() }),
  quantity: z.number().int().positive(),
  /** Copper per unit. Max ~10^11, well inside JS's exact integer range (2^53). */
  unit_price: z.number().int().nonnegative(),
});

export interface ItemAggregate {
  itemId: number;
  minPrice: bigint;
  marketPrice: bigint;
  totalQuantity: number;
  listingCount: number;
}

export interface CommodityAggregate {
  /** Valid listings seen. */
  auctionCount: number;
  /** Listings skipped because they didn't match the expected shape. */
  invalidCount: number;
  /** One entry per item, sorted by itemId. */
  items: ItemAggregate[];
}

interface ItemBook {
  /** unit price (copper) → total quantity listed at that price */
  levels: Map<number, number>;
  totalQuantity: number;
  listingCount: number;
}

/**
 * Folds listings into per-item aggregates, one listing at a time,
 * so the full snapshot never has to be in memory.
 *
 * Per item it keeps quantity per price level: effectively the ask side of an
 * order book. Thousands of listings at the same price collapse into one entry.
 */
export class CommodityAggregator {
  private readonly books = new Map<number, ItemBook>();
  private auctionCount = 0;
  private invalidCount = 0;

  add(raw: unknown): void {
    const parsed = listingSchema.safeParse(raw);
    if (!parsed.success) {
      this.invalidCount++;
      return;
    }
    const { item, quantity, unit_price: price } = parsed.data;

    let book = this.books.get(item.id);
    if (!book) {
      book = { levels: new Map(), totalQuantity: 0, listingCount: 0 };
      this.books.set(item.id, book);
    }
    book.levels.set(price, (book.levels.get(price) ?? 0) + quantity);
    book.totalQuantity += quantity;
    book.listingCount++;
    this.auctionCount++;
  }

  finish(): CommodityAggregate {
    const items = [...this.books.entries()]
      .sort(([a], [b]) => a - b)
      .map(([itemId, book]) => summarize(itemId, book));
    return {
      auctionCount: this.auctionCount,
      invalidCount: this.invalidCount,
      items,
    };
  }
}

function summarize(itemId: number, book: ItemBook): ItemAggregate {
  const levels = [...book.levels.entries()].sort(([a], [b]) => a - b); // cheapest first

  // Walk up the book until we've covered the cheapest N% of quantity (at least 1 unit).
  // Sums use BigInt: price (up to 10^11) × quantity can exceed 2^53.
  const target = Math.max(1, Math.ceil((book.totalQuantity * MARKET_DEPTH_PERCENT) / 100));
  let remaining = target;
  let cost = 0n;
  for (const [price, quantity] of levels) {
    const take = Math.min(quantity, remaining);
    cost += BigInt(price) * BigInt(take);
    remaining -= take;
    if (remaining === 0) break;
  }

  return {
    itemId,
    minPrice: BigInt(levels[0][0]),
    marketPrice: divideRoundHalfUp(cost, BigInt(target)),
    totalQuantity: book.totalQuantity,
    listingCount: book.listingCount,
  };
}

/** Integer division rounded half up (BigInt `/` truncates). */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}
