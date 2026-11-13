import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
} from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface FakeResponse {
  status: number;
  /** Objects are sent as JSON; strings are sent as-is (e.g. a fixture file). */
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * A tiny WireMock-style server for tests: a real HTTP server on 127.0.0.1
 * with a random port. Queue responses with `enqueue`, inspect what the code
 * sent via `requests`. Unexpected requests get a 500 and are still recorded.
 *
 * Point the code under test at `baseUrl`, so tests can never reach a real API.
 */
export class FakeHttpServer {
  readonly requests: RecordedRequest[] = [];
  private readonly responses: FakeResponse[] = [];
  private readonly server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      this.requests.push({
        method: req.method ?? '',
        path: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      const next = this.responses.shift() ?? {
        status: 500,
        body: { error: 'FakeHttpServer: no response queued for this request' },
      };
      res.writeHead(next.status, {
        'Content-Type': 'application/json',
        ...next.headers,
      });
      if (next.body === undefined) res.end();
      else if (typeof next.body === 'string') res.end(next.body);
      else res.end(JSON.stringify(next.body));
    });
  });

  get baseUrl(): string {
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  enqueue(...responses: FakeResponse[]): void {
    this.responses.push(...responses);
  }

  start(): Promise<void> {
    return new Promise((resolve) => this.server.listen(0, '127.0.0.1', resolve));
  }

  stop(): Promise<void> {
    // fetch keeps connections alive; close them or server.close() waits forever.
    this.server.closeAllConnections();
    return new Promise((resolve, reject) =>
      this.server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}
