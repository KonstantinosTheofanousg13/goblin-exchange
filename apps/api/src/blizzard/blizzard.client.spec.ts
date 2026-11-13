import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { FakeHttpServer } from '../../test/support/fake-http-server';
import { blizzardConfig, type BlizzardConfig } from '../config/blizzard.config';
import { BlizzardAuthService } from './blizzard-auth.service';
import { BlizzardApiError, BlizzardClient } from './blizzard.client';

const fixture = readFileSync(
  join(__dirname, '../../test/fixtures/commodities.json'),
  'utf8',
);
const LAST_MODIFIED = 'Fri, 13 Nov 2026 10:05:12 GMT';

async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

describe('BlizzardClient', () => {
  let blizzard: FakeHttpServer;
  let client: BlizzardClient;

  const token = (access_token: string) => ({
    status: 200,
    body: { access_token, expires_in: 3600 },
  });
  const commodities = () => ({
    status: 200,
    body: fixture,
    headers: { 'Last-Modified': LAST_MODIFIED },
  });

  beforeEach(async () => {
    blizzard = new FakeHttpServer();
    await blizzard.start();

    const config: BlizzardConfig = {
      clientId: 'test-client',
      clientSecret: 'test-secret',
      region: 'eu',
      oauthTokenUrl: `${blizzard.baseUrl}/token`,
      apiBaseUrl: blizzard.baseUrl,
    };
    // Real BlizzardAuthService, talking to the same fake server.
    const moduleRef = await Test.createTestingModule({
      providers: [
        BlizzardClient,
        BlizzardAuthService,
        { provide: blizzardConfig.KEY, useValue: config },
      ],
    }).compile();
    client = moduleRef.get(BlizzardClient);
  });

  afterEach(() => blizzard.stop());

  it('fetches commodities with a bearer token and streams the body', async () => {
    blizzard.enqueue(token('token-1'), commodities());

    const result = await client.fetchCommodities();

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.lastModified.toUTCString()).toBe(LAST_MODIFIED);
    expect(JSON.parse(await readAll(result.body))).toEqual(JSON.parse(fixture));

    const request = blizzard.requests[1];
    expect(request.method).toBe('GET');
    expect(request.path).toBe('/data/wow/auctions/commodities?namespace=dynamic-eu');
    expect(request.headers.authorization).toBe('Bearer token-1');
    expect(request.headers['if-modified-since']).toBeUndefined();
  });

  it('sends If-Modified-Since and reports not-modified on 304', async () => {
    blizzard.enqueue(token('token-1'), { status: 304 });

    const result = await client.fetchCommodities(new Date(LAST_MODIFIED));

    expect(result).toEqual({ status: 'not-modified' });
    expect(blizzard.requests[1].headers['if-modified-since']).toBe(LAST_MODIFIED);
  });

  it('on 401, refreshes the token and retries once', async () => {
    blizzard.enqueue(
      token('token-1'),
      { status: 401 },
      token('token-2'),
      commodities(),
    );

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

    await expect(client.fetchCommodities()).rejects.toMatchObject({
      name: 'BlizzardApiError',
      status: 401,
    });
    expect(blizzard.requests).toHaveLength(4);
  });

  it('throws BlizzardApiError with the status on server errors', async () => {
    blizzard.enqueue(token('token-1'), { status: 503 });

    const error = await client.fetchCommodities().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BlizzardApiError);
    expect(error).toMatchObject({ status: 503 });
  });

  it('rejects a snapshot without a Last-Modified header', async () => {
    blizzard.enqueue(token('token-1'), { status: 200, body: fixture });

    await expect(client.fetchCommodities()).rejects.toThrow(/Last-Modified/);
  });
});
