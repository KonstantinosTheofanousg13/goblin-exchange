import { Logger } from '@nestjs/common';
import { ResilienceModule, type ResiliencePreset } from '@nestjs/resilience';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { FakeHttpServer } from '../../test/support/fake-http-server';
import { blizzardConfig, type BlizzardConfig } from '../config/blizzard.config';
import { BlizzardAuthService } from './blizzard-auth.service';
import { BlizzardClient } from './blizzard.client';
import { BlizzardApiError } from './blizzard.errors';
import {
  BLIZZARD_RESILIENCE_OPTIONS,
  isTransientBlizzardError,
} from './blizzard.resilience';

const fixture = readFileSync(
  join(__dirname, '../../test/fixtures/commodities.json'),
  'utf8',
);
const LAST_MODIFIED = 'Fri, 13 Nov 2026 10:05:12 GMT';
const COMMODITIES_PATH = '/data/wow/auctions/commodities?namespace=dynamic-eu';

/** Same retry rules as production, but 1ms waits so tests stay fast. */
const fastRetry: ResiliencePreset = {
  retry: {
    attempts: 3,
    backoff: { delay: 1, jitter: 'none' },
    retryIf: isTransientBlizzardError,
  },
};

async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

describe('BlizzardClient', () => {
  let blizzard: FakeHttpServer;
  let warn: jest.SpyInstance;

  const token = (access_token = 'token-1') => ({
    status: 200,
    body: { access_token, expires_in: 3600 },
  });
  const commodities = () => ({
    status: 200,
    body: fixture,
    headers: { 'Last-Modified': LAST_MODIFIED },
  });
  /** Requests to the commodities endpoint only (ignores token requests). */
  const commodityRequests = () =>
    blizzard.requests.filter((r) => r.path === COMMODITIES_PATH);

  async function createClient(overrides: Partial<BlizzardConfig> = {}) {
    const config: BlizzardConfig = {
      clientId: 'test-client',
      clientSecret: 'test-secret',
      region: 'eu',
      oauthTokenUrl: `${blizzard.baseUrl}/token`,
      apiBaseUrl: blizzard.baseUrl,
      ...overrides,
    };
    // Real BlizzardAuthService and real resilience policy, talking to the fake server.
    const moduleRef = await Test.createTestingModule({
      imports: [ResilienceModule.forRoot()],
      providers: [
        BlizzardClient,
        BlizzardAuthService,
        { provide: blizzardConfig.KEY, useValue: config },
        { provide: BLIZZARD_RESILIENCE_OPTIONS, useValue: fastRetry },
      ],
    }).compile();
    return moduleRef.get(BlizzardClient);
  }

  beforeEach(async () => {
    blizzard = new FakeHttpServer();
    await blizzard.start();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await blizzard.stop();
  });

  describe('fetching', () => {
    it('fetches commodities with a bearer token and streams the body', async () => {
      blizzard.enqueue(token(), commodities());
      const client = await createClient();

      const result = await client.fetchCommodities();

      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.lastModified.toUTCString()).toBe(LAST_MODIFIED);
      expect(JSON.parse(await readAll(result.body))).toEqual(JSON.parse(fixture));

      const [request] = commodityRequests();
      expect(request.method).toBe('GET');
      expect(request.headers.authorization).toBe('Bearer token-1');
      expect(request.headers['if-modified-since']).toBeUndefined();
    });

    it('sends If-Modified-Since and reports not-modified on 304', async () => {
      blizzard.enqueue(token(), { status: 304 });
      const client = await createClient();

      const result = await client.fetchCommodities(new Date(LAST_MODIFIED));

      expect(result).toEqual({ status: 'not-modified' });
      expect(commodityRequests()[0].headers['if-modified-since']).toBe(LAST_MODIFIED);
    });

    it('on 401, refreshes the token and retries once', async () => {
      blizzard.enqueue(token('token-1'), { status: 401 }, token('token-2'), commodities());
      const client = await createClient();

      const result = await client.fetchCommodities();

      expect(result.status).toBe('ok');
      if (result.status === 'ok') result.body.destroy();
      expect(blizzard.requests.map((r) => `${r.method} ${r.path.split('?')[0]}`)).toEqual([
        'POST /token',
        'GET /data/wow/auctions/commodities',
        'POST /token',
        'GET /data/wow/auctions/commodities',
      ]);
      expect(blizzard.requests[3].headers.authorization).toBe('Bearer token-2');
    });

    it('gives up after a second 401 instead of looping', async () => {
      blizzard.enqueue(token('token-1'), { status: 401 }, token('token-2'), { status: 401 });
      const client = await createClient();

      await expect(client.fetchCommodities()).rejects.toMatchObject({
        name: 'BlizzardApiError',
        status: 401,
      });
      expect(blizzard.requests).toHaveLength(4); // 401 is not retried by the policy
    });

    it('rejects a snapshot without a Last-Modified header, without retrying', async () => {
      blizzard.enqueue(token(), { status: 200, body: fixture });
      const client = await createClient();

      await expect(client.fetchCommodities()).rejects.toThrow(/Last-Modified/);
      expect(commodityRequests()).toHaveLength(1);
    });
  });

  describe('retries', () => {
    it('retries a 503 and succeeds on the next attempt', async () => {
      blizzard.enqueue(token(), { status: 503 }, commodities());
      const client = await createClient();

      const result = await client.fetchCommodities();

      expect(result.status).toBe('ok');
      if (result.status === 'ok') result.body.destroy();
      expect(commodityRequests()).toHaveLength(2);
    });

    it('retries 429 (rate limited)', async () => {
      blizzard.enqueue(token(), { status: 429 }, commodities());
      const client = await createClient();

      const result = await client.fetchCommodities();

      expect(result.status).toBe('ok');
      if (result.status === 'ok') result.body.destroy();
      expect(commodityRequests()).toHaveLength(2);
    });

    it('gives up after 3 attempts and throws the last error', async () => {
      blizzard.enqueue(token(), { status: 503 }, { status: 502 }, { status: 500 });
      const client = await createClient();

      const error = await client.fetchCommodities().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BlizzardApiError);
      expect(error).toMatchObject({ status: 500 });
      expect(commodityRequests()).toHaveLength(3);
    });

    it('does not retry other 4xx errors', async () => {
      blizzard.enqueue(token(), { status: 404 });
      const client = await createClient();

      await expect(client.fetchCommodities()).rejects.toMatchObject({ status: 404 });
      expect(commodityRequests()).toHaveLength(1);
    });

    it('retries when the token endpoint fails with a 5xx', async () => {
      blizzard.enqueue({ status: 503 }, token(), commodities());
      const client = await createClient();

      const result = await client.fetchCommodities();

      expect(result.status).toBe('ok');
      if (result.status === 'ok') result.body.destroy();
      expect(blizzard.requests.map((r) => r.path.split('?')[0])).toEqual([
        '/token',
        '/token',
        '/data/wow/auctions/commodities',
      ]);
    });

    it('does not retry when credentials are not configured', async () => {
      const client = await createClient({ clientId: undefined, clientSecret: undefined });

      await expect(client.fetchCommodities()).rejects.toThrow(/not configured/);
      expect(blizzard.requests).toHaveLength(0);
    });

    it('retries network failures (connection refused)', async () => {
      // A server that is started then stopped: its port refuses connections.
      const down = new FakeHttpServer();
      await down.start();
      const deadUrl = down.baseUrl;
      await down.stop();
      blizzard.enqueue(token(), token(), token());
      const client = await createClient({ apiBaseUrl: deadUrl });

      const error = await client.fetchCommodities().catch((e: unknown) => e);

      expect(error).toMatchObject({ name: 'TypeError', message: 'fetch failed' });
      // Token cached after attempt 1, so only one token request; 3 failed API attempts.
      expect(blizzard.requests).toHaveLength(1);
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('logs a warning for each retry', async () => {
      blizzard.enqueue(token(), { status: 503 }, commodities());
      const client = await createClient();

      const result = await client.fetchCommodities();
      if (result.status === 'ok') result.body.destroy();

      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(
          /^BlizzardClient\.fetchCommodities: attempt 1 failed \(.*HTTP 503\), retrying in \d+ms$/,
        ),
      );
    });
  });
});
