import { pipeline, type Readable } from 'node:stream';
import { pick } from 'stream-json/filters/pick.js';
import { streamArray } from 'stream-json/streamers/stream-array.js';
import { type CommodityAggregate, CommodityAggregator } from './commodity-aggregator';

/**
 * Yields each element of the top-level `auctions` array of a commodities payload,
 * parsing incrementally: memory stays flat no matter how big the payload is.
 * (Like Jackson's streaming JsonParser, or a streaming Camel split.)
 */
export async function* readCommodityAuctions(body: Readable): AsyncGenerator<unknown> {
  // pipeline() wires errors and cleanup through every stage: if the body fails
  // mid-download or the JSON is malformed, iteration throws; if the consumer
  // stops early, all streams (and the HTTP connection) are destroyed.
  const auctions = pipeline(
    body,
    pick.withParserAsStream({ filter: 'auctions' }),
    streamArray.asStream(),
    () => {
      // Errors surface through the iterator below; nothing to do here.
    },
  );
  for await (const { value } of auctions as AsyncIterable<{ value: unknown }>) {
    yield value;
  }
}

/** Streams a commodities payload straight into per-item aggregates. */
export async function aggregateCommodityStream(body: Readable): Promise<CommodityAggregate> {
  const aggregator = new CommodityAggregator();
  for await (const listing of readCommodityAuctions(body)) {
    aggregator.add(listing);
  }
  return aggregator.finish();
}
