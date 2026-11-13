import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ResilienceEvents,
  type ResiliencePolicy,
  type ResiliencePreset,
  ResilienceService,
} from '@nestjs/resilience';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { blizzardConfig, type BlizzardConfig } from '../config/blizzard.config';
import { BlizzardAuthService } from './blizzard-auth.service';
import { BlizzardApiError } from './blizzard.errors';
import { BLIZZARD_RESILIENCE_OPTIONS } from './blizzard.resilience';

/** The commodities payload is tens of MB; allow time for the whole download. */
const COMMODITIES_TIMEOUT_MS = 120_000;
const POLICY_NAME = 'blizzard';

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
  private readonly logger = new Logger(BlizzardClient.name);
  private readonly policy: ResiliencePolicy;

  constructor(
    @Inject(blizzardConfig.KEY) private readonly config: BlizzardConfig,
    private readonly auth: BlizzardAuthService,
    resilience: ResilienceService,
    resilienceEvents: ResilienceEvents,
    @Inject(BLIZZARD_RESILIENCE_OPTIONS) resilienceOptions: ResiliencePreset,
  ) {
    // Create the policy once: it holds state (and would hold a breaker's, if we add one).
    this.policy = resilience.create(resilienceOptions, POLICY_NAME);

    resilienceEvents.events$.subscribe((event) => {
      if (event.type === 'retry' && event.policy === POLICY_NAME) {
        const reason = event.error instanceof Error ? event.error.message : String(event.error);
        this.logger.warn(
          `${event.source ?? POLICY_NAME}: attempt ${event.attempt} failed (${reason}), retrying in ${event.delayMs}ms`,
        );
      }
    });
  }

  /**
   * Region-wide commodity auctions (one call covers the whole region).
   * Transient failures (5xx, 408, 429, network errors, timeouts) are retried with backoff.
   */
  fetchCommodities(ifModifiedSince?: Date): Promise<CommoditiesResult> {
    return this.policy.execute(
      ({ signal }) => this.fetchCommoditiesOnce(signal, ifModifiedSince),
      { source: 'BlizzardClient.fetchCommodities' },
    );
  }

  private async fetchCommoditiesOnce(
    signal: AbortSignal,
    ifModifiedSince?: Date,
  ): Promise<CommoditiesResult> {
    const url = new URL('/data/wow/auctions/commodities', this.config.apiBaseUrl);
    url.searchParams.set('namespace', `dynamic-${this.config.region}`);

    let response = await this.get(url, signal, ifModifiedSince);
    if (response.status === 401) {
      // Token was revoked or expired early: get a fresh one and retry once.
      await response.body?.cancel();
      this.auth.invalidate();
      response = await this.get(url, signal, ifModifiedSince);
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

  private async get(
    url: URL,
    signal: AbortSignal,
    ifModifiedSince?: Date,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.auth.getAccessToken()}`,
      Accept: 'application/json',
    };
    if (ifModifiedSince) {
      headers['If-Modified-Since'] = ifModifiedSince.toUTCString(); // HTTP-date format
    }
    return fetch(url, {
      headers,
      // Abort on our own timeout, or when the policy cancels the execution.
      signal: AbortSignal.any([signal, AbortSignal.timeout(COMMODITIES_TIMEOUT_MS)]),
    });
  }
}
