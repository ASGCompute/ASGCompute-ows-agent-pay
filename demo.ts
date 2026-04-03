/**
 * OWS Agent Pay — Base Demo
 *
 * End-to-end demonstration of an AI agent autonomously paying for
 * inference via the x402 protocol on Base (Coinbase L2).
 *
 * Flow:
 *   1. A mock API server starts on :4020
 *   2. The AI agent sends an inference request
 *   3. Server responds HTTP 402 with x402 payment challenge
 *   4. OwsClient intercepts → PolicyEngine validates → BasePaymentAdapter settles
 *   5. X-PAYMENT proof is attached → request is retried → agent gets result
 *
 * Modes:
 *   LIVE:      npx ts-node demo.ts              (uses real Base Sepolia + faucet)
 *   SIMULATED: npx ts-node demo.ts --simulate   (no real ETH needed)
 *
 * @see https://x402.org — x402 payment protocol (built for Base)
 * @see https://pay.asgcard.dev — ASG Pay production infrastructure
 */

import http from 'http';
import { OwsClient } from './src/client';
import { BasePaymentAdapter } from './src/adapters/base';
import { PaymentAdapter } from './src/adapters/types';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const PORT = 4020;
const SIMULATE = process.argv.includes('--simulate');

// ── Treasury: the API provider's wallet ──────────────────────────────
const treasuryKey = generatePrivateKey();
const treasuryAddress = privateKeyToAccount(treasuryKey).address;

// ── Simulated Adapter (for demo without real ETH) ────────────────────
class SimulatedBaseAdapter implements PaymentAdapter {
  public readonly chainName = 'Base (Simulated)';
  public readonly caip2Id = 'eip155:84532';
  private address: string;

  constructor() {
    this.address = privateKeyToAccount(generatePrivateKey()).address;
  }

  getAddress(): string {
    return this.address;
  }

  async pay(destination: string, amount: string, _network: string): Promise<string | null> {
    const ethAmount = (Number(BigInt(amount)) / 1e18).toFixed(6);
    console.log(
      `[Base] 🚀 Building payment → ${destination.slice(0, 8)}…${destination.slice(-6)} ` +
        `(${ethAmount} ETH, Base Sepolia)`
    );
    console.log('[Base] 📡 Submitting transaction…');

    // Simulate a realistic tx hash
    const hash = '0x' + Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    console.log(`[Base] ✅ Confirmed — hash: ${hash}`);
    console.log(`[Base] 🔗 https://sepolia.basescan.org/tx/${hash}`);
    return hash;
  }
}

// ── Mock API Server: returns 402 for paid endpoints ──────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/api/inference' && req.method === 'POST') {
    const paymentHeader = req.headers['x-payment'];
    if (paymentHeader) {
      // Decode and verify the X-PAYMENT proof
      const proof = JSON.parse(Buffer.from(String(paymentHeader), 'base64').toString());
      console.log(`[API] ✅ Received X-PAYMENT proof:`);
      console.log(`[API]    x402Version: ${proof.x402Version}`);
      console.log(`[API]    chain:       ${proof.payload.chain}`);
      console.log(`[API]    tx:          ${proof.payload.transaction.slice(0, 20)}…`);
      console.log(`[API]    payTo:       ${proof.accepted.payTo.slice(0, 10)}…`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'success',
          message: 'The AI model computed the answer to life, the universe, and everything: 42.',
          chain: 'base-sepolia',
          settlement: proof.payload.transaction,
        })
      );
      return;
    }

    // No payment → respond with x402 challenge
    res.writeHead(402, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        x402Version: 2,
        resource: {
          url: '/api/inference',
          description: 'Premium AI inference — $0.50 per call',
        },
        accepts: [
          {
            scheme: 'exact',
            network: 'base-sepolia',
            amount: '500000000000000', // 0.0005 ETH in wei (~$0.50 equivalent)
            payTo: treasuryAddress,
            asset: 'ETH',
          },
        ],
      })
    );
  }
});

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   OWS Agent Pay — Base/EVM Autonomous Demo          ║');
  console.log('║   Built by ASG Pay  •  https://asgcard.dev           ║');
  console.log('║   x402 Protocol  •  Base (Coinbase L2)               ║');
  console.log(`║   Mode: ${SIMULATE ? 'SIMULATED (no real ETH)' : 'LIVE (Base Sepolia testnet)'}${SIMULATE ? '          ' : '     '}║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log();

  await new Promise<void>((r) => server.listen(PORT, r));
  console.log(`[Server] Mock x402 API on http://localhost:${PORT}`);
  console.log(`[Server] Treasury: ${treasuryAddress}`);

  console.log('\n── 🤖 AI Agent Workflow ────────────────────────────\n');

  // ── Create adapter based on mode ────────────────────────────────────
  let adapter: PaymentAdapter;

  if (SIMULATE) {
    adapter = new SimulatedBaseAdapter();
    console.log(`[Agent] Wallet:  ${adapter.getAddress()}`);
    console.log(`[Agent] Chain:   ${adapter.chainName} (${adapter.caip2Id})`);
    console.log('[Agent] 💰 Simulated balance: ∞ ETH');
  } else {
    const agentKey = generatePrivateKey();
    const realAdapter = new BasePaymentAdapter({
      privateKey: agentKey,
      network: 'testnet',
    });
    adapter = realAdapter;

    console.log(`[Agent] Wallet:  ${adapter.getAddress()}`);
    console.log(`[Agent] Chain:   ${adapter.chainName} (${adapter.caip2Id})`);

    // Fund via Coinbase faucet
    console.log('[Agent] 💧 Requesting ETH from Base Sepolia faucet…');
    try {
      const resp = await fetch('https://api.developer.coinbase.com/faucet/v1/dispense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: adapter.getAddress(),
          network: 'base-sepolia',
        }),
      });
      if (resp.ok) {
        console.log('[Agent] ✅ Wallet funded from Coinbase faucet');
        await new Promise((r) => setTimeout(r, 3000));
      } else {
        console.log('[Agent] ⚠️  Faucet unavailable — try --simulate mode');
      }
    } catch {
      console.log('[Agent] ⚠️  Faucet unavailable — try --simulate mode');
    }

    const balance = await realAdapter.getBalance();
    console.log(`[Agent] 💰 Balance: ${balance} ETH`);
  }

  console.log('\n[Agent] 🧠 Sending inference request…\n');

  // ── Create the OWS client ────────────────────────────────────────────
  const client = new OwsClient({
    baseURL: `http://localhost:${PORT}`,
    policy: {
      monthlyBudget: 10.0,
      maxAmountPerTransaction: 1.0,
      allowedDestinations: [treasuryAddress],
    },
    adapter,
  });

  try {
    const result = await client.performTask('/api/inference', {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'What is the meaning of life?' }],
    });

    console.log(`\n[Agent] 🎉 Result received:`);
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.log(`[Agent] ❌ Failed: ${err.message}`);
    if (!SIMULATE) {
      console.log('[Agent] 💡 Tip: Run with --simulate to demo without real ETH');
    }
  }

  console.log('\n── 🏁 Demo complete ───────────────────────────────');
  server.close();
  process.exit(0);
}

main().catch(console.error);
