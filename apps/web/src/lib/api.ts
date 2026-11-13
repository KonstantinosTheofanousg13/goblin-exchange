/**
 * Typed client for the NestJS REST API (see /docs on the API for the contract).
 * Prices are copper as decimal strings; dates are ISO 8601 strings.
 */

export type Copper = string
export type CandleInterval = 'hour' | 'day'
export type MoverWindow = '24h' | '7d'

export interface ItemSearchResult {
  id: number
  name: string | null
  icon: string | null
  quality: string | null
  classId: number | null
  subclassId: number | null
}

/** An auction house category: a Blizzard item class and its subclasses. */
export interface Category {
  classId: number
  name: string
  subcategories: { subclassId: number; name: string }[]
}

/** Browse filters; at least one of search or classId must be set. */
export interface ItemFilter {
  search?: string
  classId?: number
  subclassId?: number
}

export interface ItemSummary {
  itemId: number
  name: string | null
  capturedAt: string
  minPrice: Copper
  marketPrice: Copper
  totalQuantity: number
  listingCount: number
  change24hPercent: number | null
  change7dPercent: number | null
}

export interface Candle {
  time: string
  open: Copper
  high: Copper
  low: Copper
  close: Copper
  avgQuantity: number
  points: number
}

export interface CandlesResponse {
  itemId: number
  interval: CandleInterval
  from: string
  to: string
  candles: Candle[]
}

export interface Mover {
  itemId: number
  name: string | null
  previousPrice: Copper
  currentPrice: Copper
  changePercent: number
  totalQuantity: number
}

export interface ListedItem {
  itemId: number
  name: string | null
  marketPrice: Copper
  totalQuantity: number
  listingCount: number
}

/** Data freshness: when Blizzard took the newest snapshot, and when we fetched it. */
export interface MarketStatus {
  snapshotAt: string | null
  fetchedAt: string | null
}

/** A non-2xx response. `messages` holds the API's validation reasons, if any. */
export class ApiError extends Error {
  readonly status: number
  readonly messages: string[]

  constructor(status: number, messages: string[]) {
    super(messages.join('; ') || `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.messages = messages
  }
}

type Params = Record<string, string | number | undefined>

async function get<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value))
  }
  const url = query.size ? `${path}?${query}` : path
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null
    const message = body?.message
    throw new ApiError(response.status, Array.isArray(message) ? message : message ? [message] : [])
  }
  return (await response.json()) as T
}

export const api = {
  searchItems: (filter: ItemFilter, signal?: AbortSignal) =>
    get<ItemSearchResult[]>('/api/items', { ...filter, limit: 50 }, signal),

  categories: (signal?: AbortSignal) => get<Category[]>('/api/items/categories', {}, signal),

  itemSummary: (id: number, signal?: AbortSignal) => get<ItemSummary>(`/api/items/${id}`, {}, signal),

  candles: (id: number, interval: CandleInterval, signal?: AbortSignal) =>
    get<CandlesResponse>(`/api/items/${id}/candles`, { interval }, signal),

  movers: (window: MoverWindow, direction: 'up' | 'down', signal?: AbortSignal) =>
    get<Mover[]>('/api/market/movers', { window, direction, limit: 10 }, signal),

  status: (signal?: AbortSignal) => get<MarketStatus>('/api/market/status', {}, signal),

  mostListed: (signal?: AbortSignal) => get<ListedItem[]>('/api/market/most-listed', { limit: 10 }, signal),
}
