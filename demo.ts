/**
 * ──────────────────────────────────────────────────────────────
 *  OWS Agent Pay — Live Demo
 *  Run:  npm run demo
 *
 *  What happens:
 *    1. A mock API server starts on :4020 with a $0.50 paywall.
 *    2. An AI agent requests /api/inference — gets 402.
 *    3. The OWS Client autonomously checks policy, settles on
 *       Stellar Testnet, and retries the request with proof.
 *    4. The agent receives the paid content without any human.
 * ──────────────────────────────────────────────────────────────
 */

import { OwsClient, StellarPaymentAdapter } from './src';
import express from 'express';
import * as StellarSdk from '@stellar/stellar-sdk';

// ── 1. Mock API server (simulates a paid API endpoint) ───────
const app = express();
app.use(express.json());

app.post('/api/inference', (req, res) => {
  const paymentHeader = req.header('X-PAYMENT');

  if (!paymentHeader) {
    // Return an OWS-compliant 402 challenge
    return res.status(402).json({
      x402Version: 2,
      resource: {
        url: 'http://localhost:4020/api/inference',
        description: 'Premium GPU Inference — $0.50 per call',
        mimeType: 'application/json',
      },
      accepts: [
        {
          scheme: 'exact',
          network: 'testnet',
          amount: '5000000', // 0.5 XLM
          payTo: 'GAEVWHXQAPK7HZIGA4J6S5LCGS7IJ5KCWQVYW4Z4USQ63Z6WJQIFAJOF',
          asset: 'native',
        },
      ],
    });
  }

  // Payment received — serve premium content
  console.log(
    `[API] ✅ Received X-PAYMENT: ${paymentHeader.substring(0, 40)}…`
  );
  return res.json({
    status: 'success',
    data: 'The AI model computed the answer to life, the universe, and everything: 42.',
  });
});

// ── 2. Start server & run the agent ──────────────────────────
const server = app.listen(4020, async () => {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   OWS Agent Pay — Autonomous Payment Demo   ║');
  console.log('║   Built by ASG Pay  •  https://asgcard.dev   ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  console.log('[Server] Mock API listening on http://localhost:4020\n');
  console.log('── 🤖 AI Agent Workflow ────────────────────────\n');

  // Agent budget policy
  const agentPolicy = {
    monthlyBudget: 10.0,
    maxAmountPerTransaction: 1.0,
  };

  // Generate a fresh Testnet keypair and fund it
  const keypair = StellarSdk.Keypair.random();
  console.log(`[Agent] Public key:  ${keypair.publicKey()}`);

  try {
    console.log('[Agent] Funding wallet via Stellar Friendbot…');
    await fetch(
      `https://friendbot.stellar.org?addr=${keypair.publicKey()}`
    );
    console.log('[Agent] ✅ Wallet funded\n');
  } catch {
    console.log('[Agent] ⚠️  Friendbot unavailable — continuing\n');
  }

  // Initialise the OWS Client
  const client = new OwsClient({
    baseURL: 'http://localhost:4020',
    policy: agentPolicy,
    stellarAdapter: new StellarPaymentAdapter({
      secretKey: keypair.secret(),
    }),
  });

  // The agent tries to call a paid API — it has NO IDEA about the paywall
  try {
    console.log('[Agent] 🧠 Sending inference request…\n');
    const result = await client.performTask('/api/inference', {
      prompt: 'What is the meaning of life?',
    });
    console.log('\n[Agent] 🎉 Result received:\n', JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error('[Agent] ❌ Failed:', err.message);
  }

  console.log('\n── 🏁 Demo complete ───────────────────────────\n');
  server.close();
});
