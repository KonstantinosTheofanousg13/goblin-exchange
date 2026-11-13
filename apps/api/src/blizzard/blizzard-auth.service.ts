import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { blizzardConfig, type BlizzardConfig } from '../config/blizzard.config';
import { BlizzardAuthError } from './blizzard.errors';

/** Refresh this long before the token actually expires, so it never dies mid-request. */
const REFRESH_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(), // seconds
});

/**
 * OAuth client-credentials flow against Blizzard, with an in-memory token cache.
 * Singleton provider (Nest's default scope), so the cache is shared app-wide.
 */
@Injectable()
export class BlizzardAuthService {
  private readonly logger = new Logger(BlizzardAuthService.name);
  private cached?: { token: string; expiresAt: number };
  private inFlight?: Promise<string>;

  constructor(
    @Inject(blizzardConfig.KEY) private readonly config: BlizzardConfig,
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAt - REFRESH_MARGIN_MS) {
      return this.cached.token;
    }
    // Concurrent callers share one request instead of each fetching a token.
    this.inFlight ??= this.fetchToken().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  /** Drop the cached token, e.g. after the API answers 401. */
  invalidate(): void {
    this.cached = undefined;
  }

  private async fetchToken(): Promise<string> {
    const { clientId, clientSecret, oauthTokenUrl } = this.config;
    if (!clientId || !clientSecret) {
      throw new BlizzardAuthError(
        'Blizzard API credentials are not configured: set BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET in .env',
      );
    }

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(oauthTokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new BlizzardAuthError(
        `Blizzard token request failed: HTTP ${response.status}`,
        response.status,
      );
    }

    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new BlizzardAuthError('Blizzard token response has an unexpected shape');
    }

    const { access_token, expires_in } = parsed.data;
    this.cached = { token: access_token, expiresAt: Date.now() + expires_in * 1000 };
    this.logger.log(`Fetched Blizzard access token (expires in ${expires_in}s)`);
    return access_token;
  }
}
