/**
 * X Layer E2E Smoke Test
 *
 * Tests the complete x402 payment flow on X Layer:
 * 1. Mock API server returns 402 with x402 challenge
 * 2. OwsClient detects x402 protocol
 * 3. PolicyEngine validates spend
 * 4. EvmPaymentAdapter (xlayer) settles (simulated)
 * 5. Client retries with X-PAYMENT proof
 * 6. Mock server validates proof → 200 OK
 *
 * This is a real e2e test — no mocks on the OwsClient side.
 * Only the network call (adapter.pay) is simulated since we
 * don't want to spend real OKB in CI.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { OwsClient } from '../client';
import { PaymentAdapter } from '../adapters/types';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

// ── Simulated X Layer Adapter ─────────────────────────────────────────

class SimulatedXLayerAdapter implements PaymentAdapter {
  public readonly chainName = 'X Layer (Simulated)';
  public readonly caip2Id = 'eip155:196';
  private address: string;

  constructor() {
    this.address = privateKeyToAccount(generatePrivateKey()).address;
  }

  getAddress(): string {
    return this.address;
  }

  async pay(destination: string, amount: string, _network: string): Promise<string | null> {
    // Simulate successful on-chain settlement
    const hash = '0x' + Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    return hash;
  }
}

// ── Mock x402 API Server ──────────────────────────────────────────────

const treasuryKey = generatePrivateKey();
const treasuryAddress = privateKeyToAccount(treasuryKey).address;

let server: http.Server;
let port: number;

function createMockServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      // Health check
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      // x402-gated endpoint
      if (req.url === '/api/xlayer-service' && req.method === 'POST') {
        const paymentHeader = req.headers['x-payment'];

        if (paymentHeader) {
          // Validate x402 proof
          try {
            const proof = JSON.parse(
              Buffer.from(String(paymentHeader), 'base64').toString()
            );

            // Verify proof structure
            if (
              proof.x402Version &&
              proof.accepted &&
              proof.payload?.transaction &&
              proof.payload?.chain === 'eip155:196'
            ) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                status: 'success',
                data: 'X Layer DeFi analysis complete',
                chain: 'xlayer',
                settlement: proof.payload.transaction,
              }));
              return;
            }
          } catch {
            // Invalid proof
          }
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid payment proof' }));
          return;
        }

        // No payment → 402 challenge
        res.writeHead(402, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          x402Version: 2,
          resource: {
            url: '/api/xlayer-service',
            description: 'Premium X Layer DeFi analytics — $0.50 per call',
            usdAmount: 0.50,
          },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:196',
            amount: '500000', // 0.50 USDC (6 decimals)
            payTo: treasuryAddress,
            asset: 'USDC',
          }],
        }));
        return;
      }

      // 404 for anything else
      res.writeHead(404);
      res.end();
    });

    s.listen(0, () => {
      const addr = s.address() as any;
      resolve({ server: s, port: addr.port });
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('X Layer E2E — Full x402 Payment Flow', () => {
  beforeAll(async () => {
    const mock = await createMockServer();
    server = mock.server;
    port = mock.port;
  });

  afterAll(() => {
    server?.close();
  });

  it('completes full x402 flow: request → 402 → pay → retry → 200', async () => {
    const adapter = new SimulatedXLayerAdapter();

    const client = new OwsClient({
      baseURL: `http://localhost:${port}`,
      adapter,
      policy: {
        maxAmountPerTransaction: 5,
        monthlyBudget: 100,
      },
    });

    // This should:
    // 1. POST /api/xlayer-service → get 402
    // 2. Parse x402 challenge (USDC on eip155:196)
    // 3. PolicyEngine: $0.50 < $5 per-tx ✅, $0.50 < $100 monthly ✅
    // 4. SimulatedXLayerAdapter.pay() → simulated tx hash
    // 5. Retry with X-PAYMENT header → 200 OK
    const result = await client.performTask('/api/xlayer-service', {
      query: 'Analyze X Layer DeFi',
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('success');
    expect(result.data).toBe('X Layer DeFi analysis complete');
    expect(result.chain).toBe('xlayer');
    expect(result.settlement).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('policy rejects overspend on X Layer', async () => {
    const adapter = new SimulatedXLayerAdapter();

    const client = new OwsClient({
      baseURL: `http://localhost:${port}`,
      adapter,
      policy: {
        maxAmountPerTransaction: 0.10, // Only allow $0.10 — but challenge is $0.50
        monthlyBudget: 100,
      },
    });

    // PolicyEngine should reject: $0.50 > $0.10 per-tx limit
    await expect(
      client.performTask('/api/xlayer-service', { query: 'test' })
    ).rejects.toThrow();
  });

  it('X Layer adapter has correct CAIP-2 ID', () => {
    const adapter = new SimulatedXLayerAdapter();
    expect(adapter.caip2Id).toBe('eip155:196');
    expect(adapter.chainName).toBe('X Layer (Simulated)');
  });

  it('health check works (non-402 endpoint)', async () => {
    const adapter = new SimulatedXLayerAdapter();
    const client = new OwsClient({
      baseURL: `http://localhost:${port}`,
      adapter,
      policy: { maxAmountPerTransaction: 5, monthlyBudget: 100 },
    });

    const result = await client.get('/health');
    expect(result.status).toBe('ok');
  });

  it('policy tracks spend across multiple calls', async () => {
    const adapter = new SimulatedXLayerAdapter();

    const client = new OwsClient({
      baseURL: `http://localhost:${port}`,
      adapter,
      policy: {
        maxAmountPerTransaction: 5,
        monthlyBudget: 1.20, // Only $1.20 budget — allows 2 calls at $0.50 each
      },
    });

    // Call 1: $0.50 → total $0.50 → OK
    const r1 = await client.performTask('/api/xlayer-service', { q: '1' });
    expect(r1.status).toBe('success');

    // Call 2: $0.50 → total $1.00 → OK
    const r2 = await client.performTask('/api/xlayer-service', { q: '2' });
    expect(r2.status).toBe('success');

    // Call 3: $0.50 → total $1.50 → EXCEEDS $1.20 budget → REJECTED
    await expect(
      client.performTask('/api/xlayer-service', { q: '3' })
    ).rejects.toThrow();

    // Verify policy tracked correctly
    expect(client.policyEngine.getSpent()).toBeCloseTo(1.00, 2);
    expect(client.policyEngine.getRemainingBudget()).toBeCloseTo(0.20, 2);
  });
});
