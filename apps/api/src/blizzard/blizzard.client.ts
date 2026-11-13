import { Inject, Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { blizzardConfig, type BlizzardConfig } from '../config/blizzard.config';
import { BlizzardAuthService } from './blizzard-auth.service';

/** The commodities payload is tens of MB; allow time for the whole download. */
const COMMODITIES_TIMEOUT_MS = 120_000;

export class BlizzardApiError extends Error {
  override readonly name = 'BlizzardApiError';
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export type CommoditiesResult =
  /** Nothing changed since `ifModifiedSince`: skip this run. */
  | { status: 'not-modified' }
  /**
   * A new snapshot. `body` is the raw JSON as a Node stream: parse it
   * incrementally, never buffer it whole. The caller must consume or destroy it.
   */
  | { status: 'ok'; lastModified: Date; body: Readable };

@Injectable()
export class BlizzardClient {
  constructor(
    @Inject(blizzardConfig.KEY) private readonly config: BlizzardConfig,
    private readonly auth: BlizzardAuthService,
  ) {}

  /** Region-wide commodity auctions (one call covers the whole region). */
  async fetchCommodities(ifModifiedSince?: Date): Promise<CommoditiesResult> {
    const url = new URL('/data/wow/auctions/commodities', this.config.apiBaseUrl);
    url.searchParams.set('namespace', `dynamic-${this.config.region}`);

    let response = await this.get(url, ifModifiedSince);
    if (response.status === 401) {
      // Token was revoked or expired early: get a fresh one and retry once.
      await response.body?.cancel();
      this.auth.invalidate();
      response = await this.get(url, ifModifiedSince);
    }

    if (response.status === 304) {
      return { status: 'not-modified' };
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new BlizzardApiError(
        `Blizzard commodities request failed: HTTP ${response.status}`,
        response.status,
      );
    }

    // Last-Modified identifies the snapshot; without it we can't stay idempotent.
    const lastModified = new Date(response.headers.get('last-modified') ?? '');
    if (Number.isNaN(lastModified.getTime()) || !response.body) {
      await response.body?.cancel();
      throw new BlizzardApiError(
        'Blizzard commodities response is missing a valid Last-Modified header or body',
      );
    }

    return {
      status: 'ok',
      lastModified,
      body: Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
    };
  }

  private async get(url: URL, ifModifiedSince?: Date): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.auth.getAccessToken()}`,
      Accept: 'application/json',
    };
    if (ifModifiedSince) {
      headers['If-Modified-Since'] = ifModifiedSince.toUTCString(); // HTTP-date format
    }
    return fetch(url, {
      headers,
      signal: AbortSignal.timeout(COMMODITIES_TIMEOUT_MS),
    });
  }
}
