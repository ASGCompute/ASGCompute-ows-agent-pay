#!/usr/bin/env npx ts-node
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║           ASG Pay × Open Wallet Standard — Demo                    ║
 * ║                                                                    ║
 * ║  Shows the complete x402 payment flow with OWS wallet:             ║
 * ║  1. Create OWS wallet with policy-gated agent access               ║
 * ║  2. Create ASG Pay adapter backed by OWS                           ║
 * ║  3. Agent pays for an x402-gated API autonomously                  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   npx ts-node examples/ows-demo.ts
 *
 * Requirements:
 *   npm install @asgcard/pay @open-wallet-standard/core
 */

import {
  createWallet,
  createPolicy,
  createApiKey,
  deleteWallet,
} from '@open-wallet-standard/core';

import {
  createOwsAdapter,
  OwsClient,
  PolicyEngine,
} from '../src';

// Use a temporary vault for this demo
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VAULT = mkdtempSync(join(tmpdir(), 'ows-demo-'));
const log = (msg: string) => console.log(`  ${msg}`);

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   ASG Pay × OWS — Autonomous Agent Payment Demo    ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ─── Step 1: Create OWS Wallet ──────────────────────────────────
  console.log('🔑 Step 1: Creating OWS wallet...');
  const wallet = createWallet('agent-treasury', undefined, 12, VAULT);
  log(`Wallet ID: ${wallet.id}`);
  log(`Name: ${wallet.name}`);
  log(`Chains: ${wallet.accounts.length}`);
  wallet.accounts.forEach((a) => {
    log(`  ${a.chainId} → ${a.address.substring(0, 12)}...`);
  });
  console.log();

  // ─── Step 2: Create Spending Policy ─────────────────────────────
  console.log('📋 Step 2: Creating spending policy...');
  const policy = JSON.stringify({
    id: 'base-only',
    name: 'Base chain only until end of year',
    version: 1,
    created_at: new Date().toISOString(),
    rules: [
      { type: 'allowed_chains', chain_ids: ['eip155:8453'] },
      { type: 'expires_at', timestamp: '2026-12-31T23:59:59Z' },
    ],
    action: 'deny',
  });
  createPolicy(policy, VAULT);
  log('Policy "base-only" created ✅');
  log('  → Chains: eip155:8453 (Base)');
  log('  → Expires: 2026-12-31');
  console.log();

  // ─── Step 3: Create Scoped API Key ──────────────────────────────
  console.log('🔐 Step 3: Creating scoped API key for agent...');
  const key = createApiKey(
    'claude-agent',
    ['agent-treasury'],
    ['base-only'],
    '', // no passphrase for demo
    undefined,
    VAULT
  );
  log(`API Key: ${key.token.substring(0, 20)}...`);
  log(`Key ID: ${key.id}`);
  log('The agent uses this token — it NEVER sees the private key.');
  console.log();

  // ─── Step 4: Create ASG Pay Adapter ─────────────────────────────
  console.log('🔌 Step 4: Creating ASG Pay adapter backed by OWS...');
  const adapter = createOwsAdapter({
    walletName: 'agent-treasury',
    chain: 'evm',
    chainId: 'eip155:8453',
    rpcUrl: 'https://mainnet.base.org',
    passphrase: key.token, // Agent uses API key, not private key
    vaultPath: VAULT,
    logger: log,
  });
  log(`Adapter chain: ${adapter.chainName}`);
  log(`Adapter CAIP-2: ${adapter.caip2Id}`);
  log(`Adapter address: ${adapter.getAddress()}`);
  console.log();

  // ─── Step 5: Configure OwsClient ────────────────────────────────
  console.log('🤖 Step 5: Initializing OwsClient with policy engine...');
  const policyEngine = new PolicyEngine({
    maxAmountPerTx: 1_000000, // $1 max per transaction
    dailyBudget: 10_000000,   // $10 daily budget
    whitelist: ['*'],         // allow all destinations (for demo)
  });

  const client = new OwsClient({
    adapter,
    policy: policyEngine,
    logger: console,
  });
  log('OwsClient ready ✅');
  log('  → Max per tx: $1.00');
  log('  → Daily budget: $10.00');
  console.log();

  // ─── Step 6: Simulate x402 Payment ─────────────────────────────
  console.log('💳 Step 6: Agent encounters x402 Payment Required...');
  log('GET https://api.weather.example.com/forecast');
  log('→ HTTP 402 Payment Required');
  log('→ x-payment: x402 base64({"scheme":"exact","network":"eip155:8453","amount":"100000","recipient":"0xMerchant"})');
  log('');
  log('Agent auto-settles via OWS wallet + ASG Pay:');
  log('  1. Parse x402 challenge header');
  log('  2. Check policy: $0.10 < $1.00 max → ✅');
  log('  3. Route via ChainRouter: Base selected (cheapest)');
  log('  4. OWS signs transaction via API key (private key never exposed)');
  log('  5. Transaction broadcast to Base chain');
  log('  6. Retry request with payment proof');
  log('  → HTTP 200 OK + weather data');
  console.log();

  // ─── Summary ────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('✅ Demo complete! ASG Pay + OWS integration provides:');
  console.log('');
  console.log('  🔐 Key isolation — Agent NEVER sees private keys');
  console.log('  📋 Policy gating — Spending rules enforced pre-signing');
  console.log('  🌐 Multi-chain   — 9 chains from one wallet');
  console.log('  💳 x402/MPP      — Autonomous HTTP 402 settlement');
  console.log('  🔍 Audit trail   — Every tx logged and policy-checked');
  console.log('═══════════════════════════════════════════════════════\n');

  // Cleanup
  deleteWallet('agent-treasury', VAULT);
  rmSync(VAULT, { recursive: true, force: true });
}

main().catch(console.error);
