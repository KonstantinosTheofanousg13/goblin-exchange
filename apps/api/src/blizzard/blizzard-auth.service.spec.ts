import { Test } from '@nestjs/testing';
import { FakeHttpServer } from '../../test/support/fake-http-server';
import { blizzardConfig, type BlizzardConfig } from '../config/blizzard.config';
import { BlizzardAuthError, BlizzardAuthService } from './blizzard-auth.service';

describe('BlizzardAuthService', () => {
  let blizzard: FakeHttpServer;
  let now: number;

  async function createService(overrides: Partial<BlizzardConfig> = {}) {
    const config: BlizzardConfig = {
      clientId: 'test-client',
      clientSecret: 'test-secret',
      region: 'eu',
      // Points at the local fake server, so tests can never reach the real Blizzard.
      oauthTokenUrl: `${blizzard.baseUrl}/token`,
      apiBaseUrl: blizzard.baseUrl,
      ...overrides,
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        BlizzardAuthService,
        { provide: blizzardConfig.KEY, useValue: config },
      ],
    }).compile();
    return moduleRef.get(BlizzardAuthService);
  }

  const token = (access_token: string, expires_in = 3600) => ({
    status: 200,
    body: { access_token, expires_in },
  });

  beforeEach(async () => {
    blizzard = new FakeHttpServer();
    await blizzard.start();

    // Control the clock (like injecting a fixed java.time.Clock).
    now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await blizzard.stop();
  });

  it('fetches a token with client credentials (HTTP Basic auth)', async () => {
    blizzard.enqueue(token('token-1', 86_399));
    const service = await createService();

    await expect(service.getAccessToken()).resolves.toBe('token-1');

    expect(blizzard.requests).toHaveLength(1);
    const [request] = blizzard.requests;
    expect(request.method).toBe('POST');
    expect(request.path).toBe('/token');
    expect(request.headers.authorization).toBe(
      `Basic ${Buffer.from('test-client:test-secret').toString('base64')}`,
    );
    expect(request.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(request.body).toBe('grant_type=client_credentials');
  });

  it('reuses the cached token while it is still valid', async () => {
    blizzard.enqueue(token('token-1'));
    const service = await createService();

    await service.getAccessToken();
    now += 30 * 60_000; // 30 minutes later

    await expect(service.getAccessToken()).resolves.toBe('token-1');
    expect(blizzard.requests).toHaveLength(1);
  });

  it('refreshes the token shortly before it expires', async () => {
    blizzard.enqueue(token('token-1'), token('token-2'));
    const service = await createService();

    await service.getAccessToken();
    now += 3600_000 - 30_000; // 30s before expiry, inside the 60s refresh margin

    await expect(service.getAccessToken()).resolves.toBe('token-2');
    expect(blizzard.requests).toHaveLength(2);
  });

  it('shares one request between concurrent callers', async () => {
    blizzard.enqueue(token('token-1'));
    const service = await createService();

    const tokens = await Promise.all([
      service.getAccessToken(),
      service.getAccessToken(),
      service.getAccessToken(),
    ]);

    expect(tokens).toEqual(['token-1', 'token-1', 'token-1']);
    expect(blizzard.requests).toHaveLength(1);
  });

  it('fetches a new token after invalidate()', async () => {
    blizzard.enqueue(token('token-1'), token('token-2'));
    const service = await createService();

    await service.getAccessToken();
    service.invalidate();

    await expect(service.getAccessToken()).resolves.toBe('token-2');
  });

  it('throws a clear error when Blizzard rejects the credentials', async () => {
    blizzard.enqueue({ status: 401, body: { error: 'invalid_client' } });
    const service = await createService();

    await expect(service.getAccessToken()).rejects.toThrow(
      new BlizzardAuthError('Blizzard token request failed: HTTP 401'),
    );
  });

  it('throws when the token response has an unexpected shape', async () => {
    blizzard.enqueue({ status: 200, body: { unexpected: true } });
    const service = await createService();

    await expect(service.getAccessToken()).rejects.toThrow(BlizzardAuthError);
  });

  it('throws without calling Blizzard when credentials are not configured', async () => {
    const service = await createService({ clientId: undefined, clientSecret: undefined });

    await expect(service.getAccessToken()).rejects.toThrow(/not configured/);
    expect(blizzard.requests).toHaveLength(0);
  });

  it('recovers after a failed request (failure is not cached)', async () => {
    blizzard.enqueue({ status: 500 }, token('token-1'));
    const service = await createService();

    await expect(service.getAccessToken()).rejects.toThrow(BlizzardAuthError);
    await expect(service.getAccessToken()).resolves.toBe('token-1');
    expect(blizzard.requests).toHaveLength(2);
  });
});
