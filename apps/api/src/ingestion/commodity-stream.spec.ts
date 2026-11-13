import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { aggregateCommodityStream, readCommodityAuctions } from './commodity-stream';

const FIXTURE = join(__dirname, '../../test/fixtures/commodities.json');

/** Feeds text in small chunks, like a slow network, so tokens get split across chunks. */
function chunked(text: string, size = 7): Readable {
  return Readable.from(
    (function* () {
      for (let i = 0; i < text.length; i += size) yield Buffer.from(text.slice(i, i + size));
    })(),
  );
}

describe('commodity stream', () => {
  it('aggregates the fixture payload', async () => {
    const result = await aggregateCommodityStream(createReadStream(FIXTURE));

    expect(result).toEqual({
      auctionCount: 5,
      invalidCount: 0,
      items: [
        {
          itemId: 210796,
          minPrice: 1_250_000n,
          marketPrice: 1_250_000n, // 186 of 1235 units, all at the cheapest level
          totalQuantity: 1235,
          listingCount: 3,
        },
        {
          itemId: 210930,
          minPrice: 89_500n,
          // 74 of 492 units: 12 @ 89,500 + 62 @ 91,000 = 6,716,000 / 74 = 90,756.76 → 90,757
          marketPrice: 90_757n,
          totalQuantity: 492,
          listingCount: 2,
        },
      ],
    });
  });

  it('only reads the auctions array, ignoring other top-level fields', async () => {
    const payload = JSON.stringify({
      _links: { self: { href: 'x' } },
      auctions: [{ item: { id: 1 }, quantity: 1, unit_price: 5 }],
      extra: [{ item: { id: 2 }, quantity: 1, unit_price: 5 }],
    });

    const values: unknown[] = [];
    for await (const value of readCommodityAuctions(chunked(payload))) values.push(value);

    expect(values).toEqual([{ item: { id: 1 }, quantity: 1, unit_price: 5 }]);
  });

  it('fails on malformed JSON', async () => {
    const truncated = '{"auctions": [{"item": {"id": 1}, "quantity": 1, "unit_pr';

    await expect(aggregateCommodityStream(chunked(truncated))).rejects.toThrow();
  });

  it('fails when the body stream errors mid-download', async () => {
    const body = new Readable({ read() {} });
    body.push('{"auctions": [{"item": {"id": 1}, "quantity": 1, "unit_price": 5},');
    setImmediate(() => body.destroy(new Error('socket hang up')));

    await expect(aggregateCommodityStream(body)).rejects.toThrow('socket hang up');
  });

  it('handles a realistically large snapshot', async () => {
    const LISTINGS = 300_000;
    const ITEMS = 5_000;
    const body = Readable.from(
      (function* () {
        yield '{"auctions":[';
        for (let i = 0; i < LISTINGS; i++) {
          const listing = {
            id: i,
            item: { id: 1 + (i % ITEMS) },
            quantity: 1 + (i % 50),
            unit_price: 10_000 + (i % 997) * 100,
            time_left: 'LONG',
          };
          yield (i ? ',' : '') + JSON.stringify(listing);
        }
        yield ']}';
      })(),
    );

    const result = await aggregateCommodityStream(body);

    expect(result.auctionCount).toBe(LISTINGS);
    expect(result.items).toHaveLength(ITEMS);
  }, 30_000);
});
