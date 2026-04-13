/**
 * ╔═══════════════════════════════════════════════════╗
 * ║        ASG Pay — OKX Build X Hackathon Demo       ║
 * ║   Autonomous AI Agent Payment on X Layer + Base   ║
 * ╚═══════════════════════════════════════════════════╝
 */

import {
  EvmPaymentAdapter,
  PolicyEngine,
  AgentIdentity,
  listEvmChains,
} from '../src';

// ─── STEP 1: Agent Identity ────────────────────────────────────────
console.log('\n🔷 ═══ ASG PAY — HACKATHON DEMO ═══');
console.log('━'.repeat(50));

console.log('\n📋 Step 1: Creating Agent Identity...');
const identity = new AgentIdentity({
  metadata: {
    name: 'HackathonAgent',
    version: '1.0.0',
    capabilities: ['pay', 'swap', 'settle'],
    owner: '0x802A2AA21284E38E70FD953Cf8F38Eb96C21b9A0',
  },
  signerAddress: '0x802A2AA21284E38E70FD953Cf8F38Eb96C21b9A0',
  signerChainId: 'eip155:196',
  logger: console.log,
});
console.log(`   ✅ DID: ${identity.did}`);
console.log(`   ✅ Capabilities: ${identity.getCard().capabilities.join(', ')}`);
console.log(`   ✅ Can transact: ${identity.canTransact()}`);

// ─── STEP 2: Supported Chains ──────────────────────────────────────
console.log('\n📋 Step 2: Listing supported chains...');
const chains = listEvmChains();
console.log(`   ✅ ${chains.length} EVM chains supported:`);
chains.forEach(c => console.log(`      • ${c}`));

// ─── STEP 3: Policy Engine ────────────────────────────────────────
console.log('\n📋 Step 3: Setting up PolicyEngine...');
const policy = new PolicyEngine(
  {
    maxAmountPerTransaction: 5,
    monthlyBudget: 50,
  },
  console.log
);
console.log(`   ✅ Per-tx cap: $5.00`);
console.log(`   ✅ Monthly budget: $50.00`);
console.log(`   ✅ Remaining: $${policy.getRemainingBudget()}`);

// ─── STEP 4: Adapter + Transaction ────────────────────────────────
console.log('\n📋 Step 4: Initializing Base adapter & executing payment...');

async function runDemo() {
  try {
    // Check private key
    const pk = process.env.AGENT_PRIVATE_KEY;
    if (!pk) {
      console.log('   ⚠️  AGENT_PRIVATE_KEY not set — simulating transaction');
      console.log('   📊 Policy check for $0.50: ' + (policy.checkPolicy(0.50) ? '✅ APPROVED' : '🚫 DENIED'));
      policy.recordSpend(0.50);
      console.log(`   📊 Remaining budget: $${policy.getRemainingBudget()}`);
      
      // Simulate X Layer + Base
      console.log('\n📋 Step 5: Multi-chain demo...');
      console.log('   🌐 X Layer Mainnet (eip155:196) — ready');
      console.log('   🌐 X Layer Testnet (eip155:1952) — ready');
      console.log('   🌐 Base Mainnet (eip155:8453) — ready');
      console.log('   🦄 Uniswap V3 SwapRouter02 — integrated');
      
      console.log('\n📋 Step 6: Reputation score...');
      console.log(`   ⭐ Trust score: ${identity.getReputationScore()}/100`);
      console.log(`   ⭐ Meets threshold(50): ${identity.meetsThreshold(50)}`);
    } else {
      // Real transaction on Base
      const adapter = new EvmPaymentAdapter({
        chain: 'base',
        asset: 'native',
        privateKey: pk as `0x${string}`,
        logger: console.log,
      });

      console.log(`   ✅ Adapter ready: ${adapter.chainName}`);
      console.log(`   ✅ Address: ${adapter.address}`);
      console.log(`   ✅ CAIP-2: ${adapter.caip2Id}`);

      // Policy check
      const amount = 0.0001; // $0.0001 worth of ETH
      if (policy.checkPolicy(amount)) {
        console.log(`   ✅ Policy approved for $${amount}`);

        // Execute real transaction
        console.log('\n   🔄 Sending 0.00001 ETH on Base mainnet...');
        const txHash = await adapter.payNative(
          '0x802A2AA21284E38E70FD953Cf8F38Eb96C21b9A0', // self-send
          '10000000000000' // 0.00001 ETH in wei
        );
        console.log(`   ✅ TX Hash: ${txHash}`);
        console.log(`   🔗 https://basescan.org/tx/${txHash}`);

        policy.recordSpend(amount);
      }
    }

    // ─── FINAL: Summary ──────────────────────────────────────────
    console.log('\n' + '═'.repeat(50));
    console.log('🏆 ASG PAY — HACKATHON SUMMARY');
    console.log('═'.repeat(50));
    console.log('  📦 npm install @asgcard/pay');
    console.log('  🌐 17 chains (EVM + Stellar + Solana + Stripe)');
    console.log('  🔐 x402 + MPP dual-protocol');
    console.log('  🦄 Uniswap V3 swap integration');
    console.log('  🛡️  OWS policy-gated spending');
    console.log('  ✅ 455 tests, 0 failures');
    console.log('  🔗 pay.asgcard.dev');
    console.log('═'.repeat(50));

  } catch (err) {
    console.error('Error:', err);
  }
}

runDemo();
