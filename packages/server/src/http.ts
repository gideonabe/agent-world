import type { IncomingMessage, ServerResponse } from 'node:http';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'error',
  ) {
    super(message);
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function cors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-api-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
}

export function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new HttpError(413, 'Payload too large', 'payload_too_large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : undefined);
      } catch {
        reject(new HttpError(400, 'Invalid JSON', 'invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

/** Bearer header, x-api-key header, or ?token= (browsers can't set WebSocket headers). */
export function extractToken(req: IncomingMessage, url: URL): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  const x = req.headers['x-api-key'];
  if (typeof x === 'string' && x) return x;
  return url.searchParams.get('token') ?? undefined;
}

/** Token bucket per caller: `rate` events/second with `burst` capacity. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly rate: number,
    private readonly burst: number,
  ) {}

  take(id: string, cost: number): boolean {
    if (this.rate <= 0) return true;
    const now = Date.now();
    const b = this.buckets.get(id) ?? { tokens: this.burst, at: now };
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 1000) * this.rate);
    b.at = now;
    const ok = b.tokens >= cost;
    if (ok) b.tokens -= cost;
    this.buckets.set(id, b);
    if (this.buckets.size > 10_000) this.buckets.clear(); // crude memory cap
    return ok;
  }
}

export function isLoopback(host: string) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}
