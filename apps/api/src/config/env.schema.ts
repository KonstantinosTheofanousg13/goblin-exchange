import { z } from 'zod';

// Treat `KEY=` (empty in .env) the same as "not set".
const optionalString = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

/**
 * Every environment variable the app reads, validated once at startup.
 * Missing or malformed values fail the boot with a clear error,
 * instead of failing hours later inside a job.
 *
 * Only add variables here when code starts using them.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  // TODO: make required once Blizzard API credentials are available.
  BLIZZARD_CLIENT_ID: optionalString,
  BLIZZARD_CLIENT_SECRET: optionalString,
  BLIZZARD_REGION: z.enum(['eu']).default('eu'),
});

export type Env = z.infer<typeof envSchema>;
