import { envSchema, isIngestionEnabled } from './env.schema';

describe('envSchema', () => {
  const base = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
  };
  const credentials = {
    BLIZZARD_CLIENT_ID: 'id',
    BLIZZARD_CLIENT_SECRET: 'secret',
  };

  it('enables ingestion by default', () => {
    expect(envSchema.parse({ ...base, ...credentials }).INGESTION_ENABLED).toBe(
      true,
    );
  });

  it('requires Blizzard credentials while ingestion is enabled', () => {
    const result = envSchema.safeParse({ ...base, BLIZZARD_CLIENT_ID: '  ' });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'BLIZZARD_CLIENT_ID',
      'BLIZZARD_CLIENT_SECRET',
    ]);
    expect(result.error?.issues[0].message).toContain(
      'INGESTION_ENABLED=false',
    );
  });

  it('runs without credentials when ingestion is disabled', () => {
    const env = envSchema.parse({ ...base, INGESTION_ENABLED: 'false' });

    expect(env.INGESTION_ENABLED).toBe(false);
    expect(env.BLIZZARD_CLIENT_ID).toBeUndefined();
  });

  it('rejects an INGESTION_ENABLED value that is not a boolean', () => {
    expect(
      envSchema.safeParse({
        ...base,
        ...credentials,
        INGESTION_ENABLED: 'maybe',
      }).success,
    ).toBe(false);
  });
});

describe('isIngestionEnabled', () => {
  it.each([
    [undefined, true],
    ['true', true],
    ['false', false],
    ['0', false],
    ['off', false],
  ])('reads INGESTION_ENABLED=%s as %s', (value, expected) => {
    expect(isIngestionEnabled({ INGESTION_ENABLED: value })).toBe(expected);
  });
});
