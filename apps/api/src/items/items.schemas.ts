import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { copperSchema, isoDateSchema } from '../common/openapi';
import type { Candle, ItemSummary } from '../market/market.service';
import type { ItemSearchResult } from './items.service';

// ---- Requests ----

// A path param has no property name in Zod's error path, so the message names it.
const itemIdError = { error: 'id must be a positive integer' };
export const itemIdSchema = z.coerce
  .number(itemIdError)
  .int(itemIdError)
  .min(1, itemIdError)
  .max(2_147_483_647, itemIdError) // Postgres INTEGER
  .describe('Blizzard item id');

/**
 * An ISO 8601 date or date-time string, parsed to a Date.
 * Clients send strings, so the API docs describe a string; JSON Schema has no Date type.
 */
const isoDateParam = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .pipe(z.coerce.date());

const categoryIdParam = z.coerce.number().int().min(0).max(1000);

export const searchItemsQuerySchema = z
  .object({
    search: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .optional()
      .describe('Part of the item name'),
    classId: categoryIdParam
      .optional()
      .describe('Blizzard item class id (see /api/items/categories)'),
    subclassId: categoryIdParam
      .optional()
      .describe('Blizzard item subclass id; requires classId'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  // A bare GET /api/items would mean "every item": require a name or a category.
  .refine((q) => q.search !== undefined || q.classId !== undefined, {
    message: 'search or classId is required',
  })
  // Subclass ids are only unique within a class (7/9 = Herb, 0/9 is not a thing).
  .refine((q) => q.subclassId === undefined || q.classId !== undefined, {
    message: 'subclassId requires classId',
    path: ['subclassId'],
  });
export type SearchItemsQuery = z.output<typeof searchItemsQuerySchema>;

export const candlesQuerySchema = z.object({
  interval: z.enum(['hour', 'day']).default('day'),
  from: isoDateParam
    .optional()
    .describe(
      'Start (inclusive), ISO 8601. Default: 90 days (day) or 7 days (hour) before `to`',
    ),
  to: isoDateParam
    .optional()
    .describe('End (exclusive), ISO 8601. Default: now'),
});
export type CandlesQuery = z.output<typeof candlesQuerySchema>;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SPAN_MS = { day: 90 * DAY_MS, hour: 7 * DAY_MS };
/** Caps how many candles one request can produce (~366 daily, ~744 hourly). */
const MAX_SPAN_MS = { day: 366 * DAY_MS, hour: 31 * DAY_MS };

/** Fills in default dates and enforces a sane range. */
export function resolveCandleRange(
  query: CandlesQuery,
  now = new Date(),
): { from: Date; to: Date } {
  const to = query.to ?? now;
  const from =
    query.from ?? new Date(to.getTime() - DEFAULT_SPAN_MS[query.interval]);
  if (from >= to) {
    throw new BadRequestException(['from: must be before to']);
  }
  if (to.getTime() - from.getTime() > MAX_SPAN_MS[query.interval]) {
    const days = MAX_SPAN_MS[query.interval] / DAY_MS;
    throw new BadRequestException([
      `from: range too large for ${query.interval} candles (max ${days} days)`,
    ]);
  }
  return { from, to };
}

// ---- Responses ----

export const itemSearchResultSchema = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  icon: z.string().nullable(),
  quality: z.string().nullable(),
  classId: z.number().int().nullable(),
  subclassId: z.number().int().nullable(),
});

export const categorySchema = z.object({
  classId: z.number().int(),
  name: z.string(),
  subcategories: z.array(
    z.object({ subclassId: z.number().int(), name: z.string() }),
  ),
});

export const itemSummaryResponseSchema = z.object({
  itemId: z.number().int(),
  name: z.string().nullable(),
  capturedAt: isoDateSchema,
  minPrice: copperSchema,
  marketPrice: copperSchema.describe(
    'Average unit price of the cheapest 15% of listed quantity',
  ),
  totalQuantity: z.number().int(),
  listingCount: z.number().int(),
  change24hPercent: z.number().nullable(),
  change7dPercent: z.number().nullable(),
});
export type ItemSummaryResponse = z.infer<typeof itemSummaryResponseSchema>;

const candleSchema = z.object({
  time: isoDateSchema.describe('Bucket start (UTC)'),
  open: copperSchema,
  high: copperSchema,
  low: copperSchema,
  close: copperSchema,
  avgQuantity: z
    .number()
    .int()
    .describe('Average listed quantity (stands in for volume)'),
  points: z.number().int().describe('Snapshots in this bucket'),
});

export const candlesResponseSchema = z.object({
  itemId: z.number().int(),
  interval: z.enum(['hour', 'day']),
  from: isoDateSchema,
  to: isoDateSchema,
  candles: z.array(candleSchema),
});
export type CandlesResponse = z.infer<typeof candlesResponseSchema>;

// ---- Mappers (domain → JSON-safe DTO; like a Java DTO mapper) ----

export function toItemSearchResults(
  items: ItemSearchResult[],
): ItemSearchResult[] {
  return items;
}

export function toItemSummaryResponse(
  summary: ItemSummary,
): ItemSummaryResponse {
  return {
    ...summary,
    capturedAt: summary.capturedAt.toISOString(),
    minPrice: summary.minPrice.toString(),
    marketPrice: summary.marketPrice.toString(),
  };
}

export function toCandlesResponse(
  itemId: number,
  interval: CandlesQuery['interval'],
  range: { from: Date; to: Date },
  candles: Candle[],
): CandlesResponse {
  return {
    itemId,
    interval,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    candles: candles.map((c) => ({
      time: c.time.toISOString(),
      open: c.open.toString(),
      high: c.high.toString(),
      low: c.low.toString(),
      close: c.close.toString(),
      avgQuantity: c.avgQuantity,
      points: c.points,
    })),
  };
}
