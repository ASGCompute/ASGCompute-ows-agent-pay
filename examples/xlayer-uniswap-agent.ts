/**
 * X Layer + Uniswap AI Agent — Full Example
 *
 * Demonstrates an autonomous AI agent on OKX X Layer that:
 * 1. Holds OKB (native token) on X Layer
 * 2. Encounters an HTTP 402 payment challenge requiring USDC
 * 3. Uses Uniswap Trading API to swap OKB → USDC on X Layer
 * 4. Pays the 402 challenge via @asgcard/pay EvmPaymentAdapter
 * 5. Gets access to the premium resource
 *
 * This example targets the OKX Build X Hackathon "Best Uniswap Integration"
 * special prize by showing how ASG Pay + Uniswap create autonomous
 * payment agents that can pay with ANY token.
 *
 * @see https://pay.asgcard.dev — ASG Agent Pay
 * @see https://web3.okx.com/xlayer — X Layer
 * @see https://github.com/Uniswap/uniswap-ai — Uniswap AI Skills
 */

import { OwsClient } from '../src/client';
import { EvmPaymentAdapter } from '../src/adapters/evm';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayer } from 'viem/chains';

// ─── Configuration ──────────────────────────────────────────────────

/** X Layer USDC (Circle Bridged USDC Standard) */
const XLAYER_USDC = '0x74b7f16337b8972027f6196a17a631ac6de26d22' as const;
/** WOKB (Wrapped OKB) — for Uniswap routing */
const XLAYER_WOKB = '0xe538905cf8410324e03A5A23C1c177a474D59b2b' as const;
/** Uniswap V3 SwapRouter on X Layer */
const UNISWAP_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564' as const;

// ─── Uniswap Swap Helper ────────────────────────────────────────────

/**
 * Swap OKB → USDC via Uniswap V3 on X Layer.
 *
 * Uses the exactInputSingle route:
 * WOKB → USDC on the most liquid fee tier.
 */
async function swapOkbToUsdc(params: {
  privateKey: Hex;
  amountIn: bigint;
  minAmountOut: bigint;
  rpcUrl?: string;
}): Promise<{ txHash: string; usdcReceived: string }> {
  const account = privateKeyToAccount(params.privateKey);

  const walletClient = createWalletClient({
    account,
    chain: xLayer,
    transport: http(params.rpcUrl ?? 'https://xlayerrpc.okx.com'),
  });

  const publicClient = createPublicClient({
    chain: xLayer,
    transport: http(params.rpcUrl ?? 'https://xlayerrpc.okx.com'),
  });

  // Uniswap V3 SwapRouter.exactInputSingle
  const swapData = encodeFunctionData({
    abi: [
      {
        name: 'exactInputSingle',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
          {
            name: 'params',
            type: 'tuple',
            components: [
              { name: 'tokenIn', type: 'address' },
              { name: 'tokenOut', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'recipient', type: 'address' },
              { name: 'deadline', type: 'uint256' },
              { name: 'amountIn', type: 'uint256' },
              { name: 'amountOutMinimum', type: 'uint256' },
              { name: 'sqrtPriceLimitX96', type: 'uint160' },
            ],
          },
        ],
        outputs: [{ name: 'amountOut', type: 'uint256' }],
      },
    ] as const,
    functionName: 'exactInputSingle',
    args: [
      {
        tokenIn: XLAYER_WOKB,
        tokenOut: XLAYER_USDC,
        fee: 3000, // 0.3% fee tier
        recipient: account.address,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 600), // 10 min
        amountIn: params.amountIn,
        amountOutMinimum: params.minAmountOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  // Send swap tx (value = amountIn since swapping native OKB)
  const txHash = await walletClient.sendTransaction({
    to: UNISWAP_ROUTER,
    data: swapData,
    value: params.amountIn, // Sending OKB as native value
    chain: xLayer,
    account,
  });

  console.log(`[Uniswap] 🔄 Swap tx submitted: ${txHash}`);

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[Uniswap] ✅ Confirmed in block ${receipt.blockNumber}`);

  // Read USDC balance after swap
  const usdcBalance = await publicClient.readContract({
    address: XLAYER_USDC,
    abi: [
      {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      },
    ] as const,
    functionName: 'balanceOf',
    args: [account.address],
  });

  return {
    txHash,
    usdcReceived: formatUnits(usdcBalance, 6),
  };
}

// ─── Main Agent Flow ────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  ASG Agent Pay × Uniswap × X Layer                     ║');
  console.log('║  Autonomous AI Agent with Pay-With-Any-Token            ║');
  console.log('║  Built for OKX Build X Hackathon                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as Hex;
  if (!AGENT_KEY) {
    console.log('Usage: AGENT_PRIVATE_KEY=0x... npx ts-node examples/xlayer-uniswap-agent.ts');
    console.log('\nDemo mode (simulated):');
    demoSimulated();
    return;
  }

  // ── Step 1: Agent starts with OKB on X Layer ────────────────────

  console.log('[Agent] 🤖 Initializing on X Layer (Chain ID: 196)');
  console.log('[Agent] 💰 Native token: OKB');

  const publicClient = createPublicClient({
    chain: xLayer,
    transport: http('https://xlayerrpc.okx.com'),
  });

  const account = privateKeyToAccount(AGENT_KEY);
  const okbBalance = await publicClient.getBalance({ address: account.address });
  console.log(`[Agent] 📊 OKB Balance: ${formatUnits(okbBalance, 18)} OKB`);

  // ── Step 2: Swap OKB → USDC via Uniswap ────────────────────────

  console.log('\n[Agent] 🦄 Swapping OKB → USDC via Uniswap on X Layer...');
  console.log('[Agent] 📝 Zero Uniswap Labs interface fees on X Layer!');

  const swapAmount = parseUnits('1', 18); // 1 OKB
  const minUsdc = parseUnits('5', 6);     // Expect at least 5 USDC

  const { txHash: swapTx, usdcReceived } = await swapOkbToUsdc({
    privateKey: AGENT_KEY,
    amountIn: swapAmount,
    minAmountOut: minUsdc,
  });

  console.log(`[Agent] ✅ Swapped! Received ${usdcReceived} USDC`);
  console.log(`[Agent] 🔗 https://www.oklink.com/xlayer/tx/${swapTx}`);

  // ── Step 3: Use ASG Pay to handle 402 challenges ────────────────

  console.log('\n[Agent] ⚡ Creating ASG Pay client with X Layer USDC...');

  const client = new OwsClient({
    baseURL: process.env.API_URL || 'https://api.example.com',
    adapter: new EvmPaymentAdapter({
      chain: 'xlayer',
      asset: 'USDC',
      privateKey: AGENT_KEY,
    }),
    policy: {
      maxAmountPerTransaction: 5,  // Max $5 per tx
      monthlyBudget: 100,          // Max $100/month
    },
    logger: console.log,
  });

  console.log(`[Agent] 🏗️  Chain: X Layer (eip155:196)`);
  console.log(`[Agent] 💳 USDC Balance: ${usdcReceived}`);
  console.log(`[Agent] 🛡️  Policy: $5/tx, $100/month`);

  // ── Step 4: Agent autonomously pays for API access ──────────────

  console.log('\n[Agent] 🧠 Requesting premium inference...');

  try {
    const result = await client.performTask('/v1/inference', {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Analyze X Layer DeFi ecosystem' }],
    });

    console.log('[Agent] 🎉 Result:', JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.log(`[Agent] ℹ️  ${err.message}`);
    console.log('[Agent] (Expected if no live 402 API is configured)');
  }

  console.log('\n── 🏁 Agent workflow complete ──');
  console.log('   OKB → Uniswap → USDC → ASG Pay → 402 → Access ✅');
}

// ─── Simulated Demo (no keys needed) ────────────────────────────────

function demoSimulated() {
  console.log('\n── 🎬 Simulated Agent Flow ──────────────────────────');
  console.log();
  console.log('Step 1: Agent starts with 10 OKB on X Layer (Chain ID: 196)');
  console.log('Step 2: Agent needs USDC to pay for API access');
  console.log('Step 3: Uniswap V3 swap: 1 OKB → 8.50 USDC (zero interface fees!)');
  console.log('Step 4: ASG Pay OwsClient configured with EvmPaymentAdapter("xlayer")');
  console.log('Step 5: Agent calls /v1/inference');
  console.log('Step 6: Server returns 402 Payment Required (x402 challenge)');
  console.log('Step 7: PolicyEngine validates: $0.50 < $5/tx limit ✅');
  console.log('Step 8: PolicyEngine validates: $0.50 + $0 < $100/month ✅');
  console.log('Step 9: EvmPaymentAdapter sends USDC via ERC-20 transfer on X Layer');
  console.log('Step 10: OwsClient retries with X-PAYMENT proof → 200 OK ✅');
  console.log();
  console.log('── Full Flow ──');
  console.log('OKB → [Uniswap V3] → USDC → [ASG Pay] → 402 Payment → Access');
  console.log();
  console.log('Code:');
  console.log('```typescript');
  console.log('import { OwsClient, EvmPaymentAdapter } from "@asgcard/pay";');
  console.log('');
  console.log('// 1. Swap OKB → USDC on Uniswap (X Layer)');
  console.log('await swapOkbToUsdc({ privateKey, amountIn: parseUnits("1", 18) });');
  console.log('');
  console.log('// 2. Create ASG Pay agent with X Layer USDC');
  console.log('const agent = new OwsClient({');
  console.log('  baseURL: "https://api.example.com",');
  console.log('  adapter: new EvmPaymentAdapter({');
  console.log('    chain: "xlayer",');
  console.log('    asset: "USDC",');
  console.log('    privateKey: "0x...",');
  console.log('  }),');
  console.log('  policy: { maxAmountPerTransaction: 5, monthlyBudget: 100 },');
  console.log('});');
  console.log('');
  console.log('// 3. Agent pays for APIs autonomously');
  console.log('const result = await agent.performTask("/v1/inference", data);');
  console.log('```');
}

main().catch(console.error);
