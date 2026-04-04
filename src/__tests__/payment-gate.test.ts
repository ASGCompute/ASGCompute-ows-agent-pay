import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { createPaymentGate, type PaymentGateConfig } from '../server/payment-gate';

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

describe('createPaymentGate', () => {
  let server: http.Server;
  let config: PaymentGateConfig;

  beforeEach(() => {
    config = {
      x402: {
        payTo: '0xTREASURY_WALLET',
        amount: '500000',
        asset: 'USDC',
        network: 'eip155:8453',
      },
      mpp: {
        realm: 'api.example.com',
        method: 'onchain',
        amount: '50',
        recipient: '0xMPP_TREASURY',
      },
    };
  });

  afterEach(() => {
    server?.close();
  });

  async function startServer(cfg: PaymentGateConfig): Promise<http.Server> {
    const gate = createPaymentGate(cfg);
    server = http.createServer(async (req, res) => {
      await gate(req, res, () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success' }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    return server;
  }

  // ── Dual-Protocol 402 ────────────────────────────────────────────

  it('returns dual-protocol 402 when no payment header', async () => {
    await startServer(config);
    const res = await makeRequest(server, 'POST', '/api/premium');
    expect(res.status).toBe(402);
    // Should have both x402 body AND MPP WWW-Authenticate header
    expect(res.body.x402Version).toBe(2);
    expect(res.body.accepts[0].payTo).toBe('0xTREASURY_WALLET');
    expect(res.headers['www-authenticate']).toBeDefined();
    expect(res.headers['www-authenticate']).toContain('Payment');
  });

  // ── x402 Path ────────────────────────────────────────────────────

  it('routes to x402 when X-PAYMENT header present', async () => {
    await startServer(config);
    const proof = {
      x402Version: 2,
      accepted: { payTo: '0xTREASURY_WALLET', amount: '500000' },
      payload: { transaction: '0xabc', chain: 'eip155:8453' },
    };
    const encoded = Buffer.from(JSON.stringify(proof)).toString('base64');
    const res = await makeRequest(server, 'POST', '/api/premium', { 'X-Payment': encoded });
    expect(res.status).toBe(200);
  });

  // ── MPP Path ─────────────────────────────────────────────────────

  it('routes to MPP when Authorization: Payment header present', async () => {
    await startServer(config);
    const credential = {
      challenge: {
        id: 'ch_test',
        realm: 'api.example.com',
        method: 'onchain',
        intent: 'payment',
      },
      source: '0xSENDER',
      payload: { transaction: '0xmock' },
    };
    const encoded = Buffer.from(JSON.stringify(credential))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const res = await makeRequest(server, 'POST', '/api/premium', {
      Authorization: `Payment ${encoded}`,
    });
    expect(res.status).toBe(200);
  });

  // ── Logger ───────────────────────────────────────────────────────

  it('logs protocol detection', async () => {
    const logs: string[] = [];
    await startServer({ ...config, logger: (msg) => logs.push(msg) });
    await makeRequest(server, 'POST', '/api/premium');
    expect(logs.some((l) => l.includes('dual-protocol'))).toBe(true);
  });
});
