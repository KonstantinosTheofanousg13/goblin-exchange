import { z } from 'zod';
import { copperSchema, isoDateSchema } from '../common/openapi';
import type { ListedItem, MarketStatus, Mover } from './market.service';

// ---- Requests ----

export const moversQuerySchema = z.object({
  window: z.enum(['24h', '7d']).default('24h'),
  direction: z.enum(['up', 'down']).default('up').describe('up = biggest risers, down = biggest fallers'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  minQuantity: z.coerce
    .number()
    .int()
    .min(0)
    .default(100)
    .describe('Leave out items with fewer units listed (thin listings swing wildly)'),
});
export type MoversQuery = z.output<typeof moversQuerySchema>;

export const mostListedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type MostListedQuery = z.output<typeof mostListedQuerySchema>;

// ---- Responses ----

export const moverResponseSchema = z.object({
  itemId: z.number().int(),
  name: z.string().nullable(),
  previousPrice: copperSchema,
  currentPrice: copperSchema,
  changePercent: z.number(),
  totalQuantity: z.number().int(),
});
export type MoverResponse = z.infer<typeof moverResponseSchema>;

export const listedItemResponseSchema = z.object({
  itemId: z.number().int(),
  name: z.string().nullable(),
  marketPrice: copperSchema,
  totalQuantity: z.number().int(),
  listingCount: z.number().int(),
});
export type ListedItemResponse = z.infer<typeof listedItemResponseSchema>;

// ---- Mappers ----

export function toMoverResponse(mover: Mover): MoverResponse {
  return {
    ...mover,
    previousPrice: mover.previousPrice.toString(),
    currentPrice: mover.currentPrice.toString(),
  };
}

export function toListedItemResponse(item: ListedItem): ListedItemResponse {
  return { ...item, marketPrice: item.marketPrice.toString() };
}

export const marketStatusResponseSchema = z.object({
  snapshotAt: isoDateSchema.nullable().describe('When Blizzard took the newest snapshot'),
  fetchedAt: isoDateSchema.nullable().describe('When we ingested it'),
});
export type MarketStatusResponse = z.infer<typeof marketStatusResponseSchema>;

export function toMarketStatusResponse(status: MarketStatus): MarketStatusResponse {
  return {
    snapshotAt: status.snapshotAt?.toISOString() ?? null,
    fetchedAt: status.fetchedAt?.toISOString() ?? null,
  };
}
