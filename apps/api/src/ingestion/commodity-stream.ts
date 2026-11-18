import { pipeline, type Readable } from 'node:stream';
import { pick } from 'stream-json/filters/pick.js';
import { streamArray } from 'stream-json/streamers/stream-array.js';
import { type CommodityAggregate, CommodityAggregator } from './commodity-aggregator';

/**
 * Yields each element of the top-level `auctions` array of a commodities payload,
 * parsing incrementally: memory stays flat no matter how big the payload is.
 * (Like Jackson's streaming JsonParser, or a streaming Camel split.)
 */
export async function* readCommodityAuctions(
  body: Readable,
  onBytes?: (bytes: number) => void,
): AsyncGenerator<unknown> {
  // pipeline() wires errors and cleanup through every stage: if the body fails
  // mid-download or the JSON is malformed, iteration throws; if the consumer
  // stops early, all streams (and the HTTP connection) are destroyed.
  const auctions = pipeline(
    body,
    // Pass-through stage that counts raw bytes (after HTTP decompression).
    async function* (source: AsyncIterable<Buffer>) {
      for await (const chunk of source) {
        onBytes?.(chunk.length);
        yield chunk;
      }
    },
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

export interface CommodityStreamResult extends CommodityAggregate {
  /** Size of the JSON payload, for logs and capacity planning. */
  payloadBytes: number;
}

/** Streams a commodities payload straight into per-item aggregates. */
export async function aggregateCommodityStream(body: Readable): Promise<CommodityStreamResult> {
  const aggregator = new CommodityAggregator();
  let payloadBytes = 0;
  for await (const listing of readCommodityAuctions(body, (n) => (payloadBytes += n))) {
    aggregator.add(listing);
  }
  return { ...aggregator.finish(), payloadBytes };
}
