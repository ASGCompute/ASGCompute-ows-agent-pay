import { describe, it, expect, vi, beforeEach } from 'vitest';
import http from 'http';
import { createX402Gate, type X402GateConfig } from '../server/x402-gate';

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

describe('createX402Gate', () => {
  let server: http.Server;
  let config: X402GateConfig;

  beforeEach(() => {
    config = {
      payTo: '0xTREASURY_WALLET',
      amount: '500000',
      asset: 'USDC',
      network: 'eip155:8453',
      description: 'Premium API call — $0.50',
      usdAmount: 0.5,
    };
  });

  afterEach(() => {
    server?.close();
  });

  function createServer(cfg: X402GateConfig): http.Server {
    const gate = createX402Gate(cfg);
    const s = http.createServer(async (req, res) => {
      await gate(req, res, () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', data: 'premium content' }));
      });
    });
    return s;
  }

  async function startServer(cfg: X402GateConfig): Promise<http.Server> {
    server = createServer(cfg);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    return server;
  }

  // ── 402 Challenge Response ────────────────────────────────────────

  it('returns 402 when no X-PAYMENT header', async () => {
    await startServer(config);
    const res = await makeRequest(server, 'GET', '/api/premium');
    expect(res.status).toBe(402);
    expect(res.body.x402Version).toBe(2);
    expect(res.body.accepts).toHaveLength(1);
    expect(res.body.accepts[0].payTo).toBe('0xTREASURY_WALLET');
    expect(res.body.accepts[0].amount).toBe('500000');
    expect(res.body.accepts[0].asset).toBe('USDC');
  });

  it('includes resource URL and description in challenge', async () => {
    await startServer(config);
    const res = await makeRequest(server, 'GET', '/api/premium');
    expect(res.body.resource.url).toBe('/api/premium');
    expect(res.body.resource.description).toContain('Premium');
    expect(res.body.resource.usdAmount).toBe(0.5);
  });

  it('uses custom x402Version', async () => {
    await startServer({ ...config, x402Version: 3 });
    const res = await makeRequest(server, 'GET', '/api/test');
    expect(res.body.x402Version).toBe(3);
  });

  // ── Successful Payment Verification ──────────────────────────────

  it('passes through with valid X-PAYMENT header', async () => {
    await startServer(config);
    const proof = {
      x402Version: 2,
      accepted: {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '500000',
        payTo: '0xTREASURY_WALLET',
        asset: 'USDC',
      },
      payload: { transaction: '0xabc123def456', chain: 'eip155:8453' },
    };
    const encoded = Buffer.from(JSON.stringify(proof)).toString('base64');
    const res = await makeRequest(server, 'GET', '/api/premium', { 'X-Payment': encoded });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  // ── Validation Checks ────────────────────────────────────────────

  it('rejects invalid base64 X-PAYMENT', async () => {
    await startServer(config);
    const res = await makeRequest(server, 'GET', '/api/premium', { 'X-Payment': '!!invalid!!' });
    expect(res.status).toBe(400);
  });

  it('rejects missing transaction in proof', async () => {
    await startServer(config);
    const proof = { x402Version: 2, accepted: {}, payload: {} };
    const encoded = Buffer.from(JSON.stringify(proof)).toString('base64');
    const res = await makeRequest(server, 'GET', '/api/premium', { 'X-Payment': encoded });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('transaction');
  });

  it('rejects wrong destination', async () => {
    await startServer(config);
    const proof = {
      x402Version: 2,
      accepted: { payTo: '0xWRONG_WALLET', amount: '500000' },
      payload: { transaction: '0xabc', chain: 'eip155:8453' },
    };
    const encoded = Buffer.from(JSON.stringify(proof)).toString('base64');
    const res = await makeRequest(server, 'GET', '/api/premium', { 'X-Payment': encoded });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('destination');
  });

  it('rejects wrong amount', async () => {
    await startServer(config);
    const proof = {
      x402Version: 2,
      accepted: { payTo: '0xTREASURY_WALLET', amount: '999999' },
      payload: { transaction: '0xabc', chain: 'eip155:8453' },
    };
    const encoded = Buffer.from(JSON.stringify(proof)).toString('base64');
    const res = await makeRequest(server, 'GET', '/api/premium', { 'X-Payment': encoded });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('amount');
  });

  // ── Custom Verification ──────────────────────────────────────────

  it('calls custom verifyPayment and passes on true', async () => {
    const verifyFn = vi.fn().mockResolvedValue(true);
    await startServer({ ...config, verifyPayment: verifyFn });

    const proof = {
      x402Version: 2,
      accepted: { payTo: '0xTREASURY_WALLET', amount: '500000' },
      payload: { transaction: '0xabc', chain: 'eip155:8453' },
    };
    const encoded = Buffer.from(JSON.stringify(proof)).toString('base64');
    const res = await makeRequest(server, 'GET', '/api/premium', { 'X-Payment': encoded });
    expect(res.status).toBe(200);
    expect(verifyFn).toHaveBeenCalledOnce();
  });

  it('rejects when custom verifyPayment returns false', async () => {
    const verifyFn = vi.fn().mockResolvedValue(false);
    await startServer({ ...config, verifyPayment: verifyFn });

    const proof = {
      x402Version: 2,
      accepted: { payTo: '0xTREASURY_WALLET', amount: '500000' },
      payload: { transaction: '0xabc', chain: 'eip155:8453' },
    };
    const encoded = Buffer.from(JSON.stringify(proof)).toString('base64');
    const res = await makeRequest(server, 'GET', '/api/premium', { 'X-Payment': encoded });
    expect(res.status).toBe(402);
  });

  // ── Logger ───────────────────────────────────────────────────────

  it('calls logger during challenge generation', async () => {
    const logs: string[] = [];
    await startServer({ ...config, logger: (msg) => logs.push(msg) });
    await makeRequest(server, 'GET', '/api/premium');
    expect(logs.some((l) => l.includes('402'))).toBe(true);
  });

  it('calls logger during verification', async () => {
    const logs: string[] = [];
    await startServer({ ...config, logger: (msg) => logs.push(msg) });

    const proof = {
      x402Version: 2,
      accepted: { payTo: '0xTREASURY_WALLET', amount: '500000' },
      payload: { transaction: '0xabc123', chain: 'eip155:8453' },
    };
    const encoded = Buffer.from(JSON.stringify(proof)).toString('base64');
    await makeRequest(server, 'GET', '/api/premium', { 'X-Payment': encoded });
    expect(logs.some((l) => l.includes('verified'))).toBe(true);
  });
});
