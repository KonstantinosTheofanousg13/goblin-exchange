import { ConfigType, registerAs } from '@nestjs/config';
import { envSchema } from './env.schema';

/**
 * Typed `blizzard` config namespace (like a Spring @ConfigurationProperties("blizzard") class).
 * Inject with: @Inject(blizzardConfig.KEY) private readonly config: BlizzardConfig
 */
export const blizzardConfig = registerAs('blizzard', () => {
  const env = envSchema.parse(process.env);
  return {
    clientId: env.BLIZZARD_CLIENT_ID,
    clientSecret: env.BLIZZARD_CLIENT_SECRET,
    region: env.BLIZZARD_REGION,
    oauthTokenUrl: 'https://oauth.battle.net/token',
    apiBaseUrl: `https://${env.BLIZZARD_REGION}.api.blizzard.com`,
  };
});

export type BlizzardConfig = ConfigType<typeof blizzardConfig>;
