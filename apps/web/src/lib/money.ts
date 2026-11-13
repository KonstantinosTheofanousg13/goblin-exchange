/**
 * WoW money: 1 gold = 100 silver = 10,000 copper.
 * The API sends copper as a decimal string (it can exceed 2^53), so the
 * formatting here uses BigInt and never goes through floating point.
 */
const COPPER_PER_SILVER = 100n
const COPPER_PER_GOLD = 10_000n

export interface Coins {
  gold: bigint
  silver: bigint
  copper: bigint
}

export function splitCopper(copper: string): Coins {
  const total = BigInt(copper)
  return {
    gold: total / COPPER_PER_GOLD,
    silver: (total % COPPER_PER_GOLD) / COPPER_PER_SILVER,
    copper: total % COPPER_PER_SILVER,
  }
}

/** "1,234g 05s 07c". Leading zero units are dropped: "5s 07c", "7c". */
export function formatMoney(copper: string): string {
  const { gold, silver, copper: c } = splitCopper(copper)
  const pad = (n: bigint) => n.toString().padStart(2, '0')
  if (gold > 0n) return `${gold.toLocaleString('en-US')}g ${pad(silver)}s ${pad(c)}c`
  if (silver > 0n) return `${silver}s ${pad(c)}c`
  return `${c}c`
}

/**
 * Copper string → gold as a float, for chart axes only (charts need numbers).
 * Fine for plotting: even at the 10M gold cap this keeps 4 decimals.
 */
export function copperToGold(copper: string): number {
  return Number(BigInt(copper)) / Number(COPPER_PER_GOLD)
}

/** Gold float (from a chart) → "1,234.56g". */
export function formatGold(gold: number): string {
  const digits = gold >= 100 ? 0 : gold >= 1 ? 2 : 4
  return `${gold.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}g`
}

/** +12.5% / -3.25% / — */
export function formatChange(percent: number | null): string {
  if (percent === null) return '—'
  const sign = percent > 0 ? '+' : ''
  return `${sign}${percent.toFixed(2)}%`
}

/** 1234 → "1,234", 1234567 → "1.23M" */
export function formatQuantity(quantity: number): string {
  if (quantity >= 1_000_000) return `${(quantity / 1_000_000).toFixed(2)}M`
  if (quantity >= 100_000) return `${(quantity / 1_000).toFixed(0)}k`
  return quantity.toLocaleString('en-US')
}
