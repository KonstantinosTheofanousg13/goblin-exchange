import { CommodityAggregator } from './commodity-aggregator';

const listing = (itemId: number, quantity: number, unitPrice: number) => ({
  id: Math.floor(Math.random() * 1e9),
  item: { id: itemId },
  quantity,
  unit_price: unitPrice,
  time_left: 'LONG',
});

function aggregate(listings: unknown[]) {
  const aggregator = new CommodityAggregator();
  listings.forEach((l) => aggregator.add(l));
  return aggregator.finish();
}

describe('CommodityAggregator', () => {
  it('computes min price, totals and listing count per item', () => {
    const result = aggregate([
      listing(1, 200, 1_250_000),
      listing(1, 35, 1_260_000),
      listing(1, 1000, 1_299_900),
    ]);

    expect(result.items).toEqual([
      {
        itemId: 1,
        minPrice: 1_250_000n,
        // 15% of 1235 = 185.25 → 186 units, all from the cheapest level
        marketPrice: 1_250_000n,
        totalQuantity: 1235,
        listingCount: 3,
      },
    ]);
    expect(result.auctionCount).toBe(3);
  });

  it('averages across price levels, weighted by quantity', () => {
    // 15% of 20 = 3 units: 2 @ 100 + 1 @ 1000 → 1200 / 3 = 400
    const result = aggregate([listing(1, 2, 100), listing(1, 18, 1000)]);

    expect(result.items[0].marketPrice).toBe(400n);
  });

  it('rounds the market price half up', () => {
    // 15% of 10 = 1.5 → 2 units: 1 @ 100 + 1 @ 101 → 100.5 → 101
    const result = aggregate([listing(1, 1, 100), listing(1, 1, 101), listing(1, 8, 999)]);

    expect(result.items[0].marketPrice).toBe(101n);
  });

  it('does not depend on listing order', () => {
    const listings = [listing(1, 18, 1000), listing(1, 2, 100)];

    expect(aggregate(listings)).toEqual(aggregate([...listings].reverse()));
    expect(aggregate(listings).items[0]).toMatchObject({ minPrice: 100n, marketPrice: 400n });
  });

  it('merges listings at the same price', () => {
    const result = aggregate([listing(1, 5, 100), listing(1, 5, 100), listing(1, 10, 200)]);

    // 15% of 20 = 3 units, all at 100 (10 units available there)
    expect(result.items[0]).toMatchObject({ marketPrice: 100n, totalQuantity: 20, listingCount: 3 });
  });

  it('uses at least one unit for tiny quantities', () => {
    const result = aggregate([listing(1, 1, 777)]);

    expect(result.items[0]).toMatchObject({ minPrice: 777n, marketPrice: 777n });
  });

  it('stays exact for prices near the gold cap (no float rounding)', () => {
    const tenMillionGold = 100_000_000_000; // copper
    // 15% of 1,000,000 = 150,000 units; cost = 1.5 × 10^16, beyond 2^53
    const result = aggregate([listing(1, 1_000_000, tenMillionGold)]);

    expect(result.items[0].marketPrice).toBe(100_000_000_000n);
  });

  it('keeps items separate and sorted by item id', () => {
    const result = aggregate([listing(30, 1, 5), listing(10, 1, 7), listing(20, 1, 6)]);

    expect(result.items.map((i) => i.itemId)).toEqual([10, 20, 30]);
  });

  it('skips and counts listings with an unexpected shape', () => {
    const result = aggregate([
      listing(1, 10, 100),
      { item: { id: 1 }, quantity: 10 }, // no unit_price (a non-commodity auction)
      { item: { id: 1 }, quantity: -1, unit_price: 100 },
      { item: { id: 1 }, quantity: 1.5, unit_price: 100 },
      { item: { id: '1' }, quantity: 1, unit_price: 100 },
      null,
      'garbage',
    ]);

    expect(result.auctionCount).toBe(1);
    expect(result.invalidCount).toBe(6);
    expect(result.items).toHaveLength(1);
  });

  it('returns no items for an empty snapshot', () => {
    expect(aggregate([])).toEqual({ auctionCount: 0, invalidCount: 0, items: [] });
  });
});
