import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 doesn't load .env by itself. The CLI runs from apps/api,
// but .env lives at the repo root, so check both (first match wins).
config({ path: ['.env', '../../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
