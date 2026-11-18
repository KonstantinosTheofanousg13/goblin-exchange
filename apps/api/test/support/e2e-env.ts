/**
 * Jest setupFiles for e2e tests: runs before each test file, before .env is loaded
 * (ConfigModule never overrides variables that are already set).
 *
 * E2E tests share the dev Postgres and Redis, and some boot the full AppModule.
 * With ingestion on, they would change the dev ingestion schedule and run real
 * Blizzard ingestions. Off, they need no Blizzard credentials either (as in CI).
 * The ingestion e2e test drives IngestionService directly, so it is unaffected.
 */
process.env.INGESTION_ENABLED = 'false';
