import { z } from 'zod';

// Treat `KEY=` (empty in .env) the same as "not set".
const optionalString = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

/**
 * Whether this instance runs commodities ingestion (scheduler + worker).
 * Defaults to on, so production needs nothing extra; tests and keyless local
 * setups turn it off explicitly. Accepts true/false, 1/0, yes/no, on/off.
 */
const ingestionEnabledSchema = z.stringbool().default(true);

/** Reads INGESTION_ENABLED from a raw environment (used before Nest's DI is up). */
export function isIngestionEnabled(
  env: Record<string, string | undefined>,
): boolean {
  return ingestionEnabledSchema.parse(env.INGESTION_ENABLED);
}

/**
 * Every environment variable the app reads, validated once at startup.
 * Missing or malformed values fail the boot with a clear error,
 * instead of failing hours later inside a job.
 *
 * Only add variables here when code starts using them.
 */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),

    INGESTION_ENABLED: ingestionEnabledSchema,
    // Required when INGESTION_ENABLED is true (see the refinement below).
    BLIZZARD_CLIENT_ID: optionalString,
    BLIZZARD_CLIENT_SECRET: optionalString,
    BLIZZARD_REGION: z.enum(['eu']).default('eu'),
  })
  // Fail fast: an instance that should ingest but has no credentials would boot
  // "healthy" and never collect data. Like @NotBlank on a Spring
  // @ConfigurationProperties field, but only when the feature is switched on.
  .superRefine((env, ctx) => {
    if (!env.INGESTION_ENABLED) return;
    for (const key of [
      'BLIZZARD_CLIENT_ID',
      'BLIZZARD_CLIENT_SECRET',
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message:
            'Required while INGESTION_ENABLED is true. Set it in .env, or set INGESTION_ENABLED=false to run without ingestion',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;
