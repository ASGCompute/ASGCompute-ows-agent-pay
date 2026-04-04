import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { createMppGate, type MppGateConfig } from '../server/mpp-gate';

function makeRequest(
  server: http.Server,
  method: string,
  path: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const req = http.request(
      { hostname: 'localhost', port: addr.port, method, path, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let body: any;
          try { body = JSON.parse(data); } catch { body = data; }
          resolve({ status: res.statusCode!, headers: res.headers, body });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('createMppGate', () => {
  let server: http.Server;
  let config: MppGateConfig;

  beforeEach(() => {
    config = {
      realm: 'api.example.com',
      method: 'onchain',
      amount: '50',
      currency: 'usd',
      decimals: 2,
      recipient: '0xMPP_TREASURY',
    };
  });

  afterEach(() => {
    server?.close();
  });

  async function startServer(cfg: MppGateConfig): Promise<http.Server> {
    const gate = createMppGate(cfg);
    server = http.createServer(async (req, res) => {
      await gate(req, res, () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success' }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    return server;
  }

  function buildCredential(overrides: any = {}): string {
    const challengeDefaults = {
      id: 'ch_test',
      realm: 'api.example.com',
      method: 'onchain',
      intent: 'payment',
      request: 'dGVzdA',
    };
    const credential = {
      challenge: { ...challengeDefaults, ...(overrides.challenge || {}) },
      source: overrides.source || '0xSENDER',
      payload: { transaction: '0xMOCK_TX', ...(overrides.payload || {}) },
    };
    return Buffer.from(JSON.stringify(credential))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // ── 402 Challenge ─────────────────────────────────────────────────

  it('returns 402 when no Authorization header', async () => {
    await startServer(config);
    const res = await makeRequest(server, 'POST', '/api/premium');
    expect(res.status).toBe(402);
    expect(res.headers['www-authenticate']).toBeDefined();
    expect(res.headers['www-authenticate']).toContain('Payment');
  });

  it('includes challenge ID, realm, method, intent in WWW-Authenticate', async () => {
    await startServer(config);
    const res = await makeRequest(server, 'POST', '/api/premium');
    const auth = res.headers['www-authenticate'] as string;
    expect(auth).toContain('id="');
    expect(auth).toContain('realm="api.example.com"');
    expect(auth).toContain('method="onchain"');
    expect(auth).toContain('intent="payment"');
    expect(auth).toContain('request="');
    expect(auth).toContain('expires="');
  });

  it('includes expires in challenge', async () => {
    await startServer(config);
    const res = await makeRequest(server, 'POST', '/api/premium');
    const auth = res.headers['www-authenticate'] as string;
    const expiresMatch = auth.match(/expires="([^"]+)"/);
    expect(expiresMatch).toBeTruthy();
    const expiresAt = new Date(expiresMatch![1]).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  // ── Successful Credential ────────────────────────────────────────

  it('passes through with valid Authorization: Payment', async () => {
    await startServer(config);
    const cred = buildCredential();
    const res = await makeRequest(server, 'POST', '/api/premium', {
      Authorization: `Payment ${cred}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  // ── Validation ───────────────────────────────────────────────────

  it('rejects malformed credential (no challenge.id)', async () => {
    await startServer(config);
    const bad = Buffer.from(JSON.stringify({ payload: { transaction: '0x1' } }))
      .toString('base64');
    const res = await makeRequest(server, 'POST', '/api/premium', {
      Authorization: `Payment ${bad}`,
    });
    expect(res.status).toBe(400);
  });

  it('rejects realm mismatch', async () => {
    await startServer(config);
    const cred = buildCredential({ challenge: { realm: 'wrong.example.com' } });
    const res = await makeRequest(server, 'POST', '/api/premium', {
      Authorization: `Payment ${cred}`,
    });
    expect(res.status).toBe(403);
  });

  it('rejects expired credential', async () => {
    await startServer(config);
    const expiredDate = new Date(Date.now() - 60000).toISOString();
    const cred = buildCredential({ challenge: { expires: expiredDate } });
    const res = await makeRequest(server, 'POST', '/api/premium', {
      Authorization: `Payment ${cred}`,
    });
    expect(res.status).toBe(402);
    expect(res.body.error).toContain('expired');
  });

  it('rejects invalid base64 credential', async () => {
    await startServer(config);
    const res = await makeRequest(server, 'POST', '/api/premium', {
      Authorization: 'Payment !!invalid!!',
    });
    expect(res.status).toBe(400);
  });

  // ── Custom Verification ──────────────────────────────────────────

  it('calls custom verifyCredential and passes on true', async () => {
    const verifyFn = vi.fn().mockResolvedValue(true);
    await startServer({ ...config, verifyCredential: verifyFn });
    const cred = buildCredential();
    const res = await makeRequest(server, 'POST', '/api/premium', {
      Authorization: `Payment ${cred}`,
    });
    expect(res.status).toBe(200);
    expect(verifyFn).toHaveBeenCalledOnce();
  });

  it('rejects when custom verifyCredential returns false', async () => {
    const verifyFn = vi.fn().mockResolvedValue(false);
    await startServer({ ...config, verifyCredential: verifyFn });
    const cred = buildCredential();
    const res = await makeRequest(server, 'POST', '/api/premium', {
      Authorization: `Payment ${cred}`,
    });
    expect(res.status).toBe(402);
  });

  // ── Logger ───────────────────────────────────────────────────────

  it('logs challenge generation', async () => {
    const logs: string[] = [];
    await startServer({ ...config, logger: (msg) => logs.push(msg) });
    await makeRequest(server, 'POST', '/api/premium');
    expect(logs.some((l) => l.includes('402'))).toBe(true);
  });
});
