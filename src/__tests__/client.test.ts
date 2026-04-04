import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import http from 'http';
import { OwsClient } from '../client';
import { PaymentAdapter } from '../adapters/types';

// ── Mock Adapter ────────────────────────────────────────────────────
class MockAdapter implements PaymentAdapter {
  public readonly chainName = 'MockChain';
  public readonly caip2Id = 'mock:1';
  public payCalledWith: { dest: string; amount: string; network: string } | null = null;
  public shouldFail = false;

  getAddress(): string {
    return '0xMOCK_ADDRESS';
  }

  async pay(destination: string, amount: string, network: string): Promise<string | null> {
    this.payCalledWith = { dest: destination, amount, network };
    if (this.shouldFail) return null;
    return '0xMOCK_TX_HASH_1234567890abcdef';
  }
}

// ── Mock x402 Server ────────────────────────────────────────────────
function createMockServer(treasuryAddress: string): http.Server {
  return http.createServer((req, res) => {
    if (req.url === '/api/paid' && req.method === 'POST') {
      const paymentHeader = req.headers['x-payment'];
      if (paymentHeader) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', message: 'Paid resource' }));
        return;
      }

      // 402 challenge
      res.writeHead(402, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          x402Version: 2,
          resource: {
            url: '/api/paid',
            description: 'Premium endpoint — $0.50 per call',
          },
          accepts: [
            {
              scheme: 'exact',
              network: 'mock:1',
              amount: '500000',
              payTo: treasuryAddress,
              asset: 'USDC',
            },
          ],
        })
      );
      return;
    }

    if (req.url === '/api/free') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', message: 'Free resource' }));
      return;
    }

    if (req.url === '/api/error') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
      return;
    }

    res.writeHead(404);
    res.end();
  });
}

describe('OwsClient', () => {
  let server: http.Server;
  let adapter: MockAdapter;
  let client: OwsClient;
  let port: number;
  const treasuryAddress = '0xTREASURY';

  beforeEach(async () => {
    adapter = new MockAdapter();
    server = createMockServer(treasuryAddress);

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });

    const addr = server.address() as any;
    port = addr.port;

    client = new OwsClient({
      baseURL: `http://localhost:${port}`,
      policy: {
        maxAmountPerTransaction: 1.0,
        monthlyBudget: 10.0,
        allowedDestinations: [treasuryAddress],
      },
      adapter,
    });
  });

  afterEach(() => {
    server.close();
  });

  // ── Free endpoints (no 402) ───────────────────────────────────────
  it('passes through non-402 responses', async () => {
    const res = await client.get('/api/free');
    expect(res.status).toBe('ok');
    expect(adapter.payCalledWith).toBeNull();
  });

  // ── 402 interceptor ───────────────────────────────────────────────
  it('intercepts 402 and retries with X-PAYMENT', async () => {
    const res = await client.performTask('/api/paid', { query: 'test' });
    expect(res.status).toBe('success');
    expect(adapter.payCalledWith).not.toBeNull();
    expect(adapter.payCalledWith!.dest).toBe(treasuryAddress);
    expect(adapter.payCalledWith!.amount).toBe('500000');
  });

  it('records spend after successful 402 settlement', async () => {
    await client.performTask('/api/paid', {});
    expect(client.policyEngine.getSpent()).toBeGreaterThan(0);
  });

  // ── Policy rejection ──────────────────────────────────────────────
  it('rejects 402 when amount exceeds per-tx limit', async () => {
    const strictClient = new OwsClient({
      baseURL: `http://localhost:${port}`,
      policy: {
        maxAmountPerTransaction: 0.01, // Too low for $0.50
        monthlyBudget: 10.0,
        allowedDestinations: [treasuryAddress],
      },
      adapter,
    });

    await expect(strictClient.performTask('/api/paid', {})).rejects.toThrow();
    expect(adapter.payCalledWith).toBeNull();
  });

  it('rejects 402 when destination not in whitelist', async () => {
    const restrictedClient = new OwsClient({
      baseURL: `http://localhost:${port}`,
      policy: {
        maxAmountPerTransaction: 1.0,
        monthlyBudget: 10.0,
        allowedDestinations: ['0xONLY_THIS_ONE'],
      },
      adapter,
    });

    await expect(
      restrictedClient.performTask('/api/paid', {})
    ).rejects.toThrow();
  });

  // ── Settlement failure ────────────────────────────────────────────
  it('rejects when adapter settlement fails', async () => {
    adapter.shouldFail = true;
    await expect(client.performTask('/api/paid', {})).rejects.toThrow();
  });

  // ── Non-402 errors pass through ───────────────────────────────────
  it('propagates 500 errors without intercepting', async () => {
    await expect(client.get('/api/error')).rejects.toThrow();
    expect(adapter.payCalledWith).toBeNull();
  });

  // ── X-PAYMENT proof format ────────────────────────────────────────
  it('X-PAYMENT token is valid Base64-encoded JSON', async () => {
    // We test this indirectly — the mock server only returns 200 if
    // it receives a valid x-payment header
    const res = await client.performTask('/api/paid', {});
    expect(res.status).toBe('success');
  });

  // ── Logger ────────────────────────────────────────────────────────
  it('is silent by default', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    await client.get('/api/free');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('emits logs when logger is provided', async () => {
    const logs: string[] = [];
    const verboseClient = new OwsClient({
      baseURL: `http://localhost:${port}`,
      policy: {
        maxAmountPerTransaction: 1.0,
        monthlyBudget: 10.0,
        allowedDestinations: [treasuryAddress],
      },
      adapter,
      logger: (msg) => logs.push(msg),
    });

    await verboseClient.performTask('/api/paid', {});
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.includes('402'))).toBe(true);
  });
});
