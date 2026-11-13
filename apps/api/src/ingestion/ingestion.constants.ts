export const INGESTION_QUEUE = 'ingestion';
export const INGEST_COMMODITIES_JOB = 'ingest-commodities';
export const COMMODITIES_SCHEDULER_ID = 'commodities-poll';

/**
 * Blizzard publishes a new snapshot about hourly, at no fixed minute.
 * Polling every 15 minutes picks it up soon after it appears, and the
 * If-Modified-Since / 304 check makes the polls in between almost free.
 */
export const COMMODITIES_POLL_INTERVAL_MS = 15 * 60_000;
