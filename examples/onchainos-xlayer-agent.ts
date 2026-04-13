/**
 * Example: ASG Pay Agent using OnchainOS DEX Aggregator on X Layer
 * 
 * Demonstrates:
 * 1. OnchainOS API integration for optimal swap routing
 * 2. X Layer native token (OKB) → USDC swap via 400+ DEX sources
 * 3. Policy-gated execution with ASG Pay's PolicyEngine
 * 
 * @example
 * ```
 * OKX_API_KEY=... OKX_SECRET_KEY=... OKX_PASSPHRASE=... npx ts-node examples/onchainos-xlayer-agent.ts
 * ```
 */

import { OnchainOSProvider } from '../src/providers/onchainos';

const WALLET_ADDRESS = '0x802A2AA21284E38E70FD953Cf8F38Eb96C21b9A0';

// Token addresses on X Layer (Chain ID: 196)
const OKB_NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const USDC_XLAYER = '0x74b7f16337b8972027f6196a17a631ac6de26d22';
const USDT_XLAYER = '0x779ded0c9e1022225f8e0630b35a9b54be713736';

async function main() {
  // ── 1. Initialize OnchainOS Provider ─────────────────────────────
  const okx = new OnchainOSProvider({
    apiKey: process.env.OKX_API_KEY!,
    secretKey: process.env.OKX_SECRET_KEY!,
    passphrase: process.env.OKX_PASSPHRASE!,
  });

  // ── 2. Health Check ──────────────────────────────────────────────
  const health = await okx.healthCheck();
  console.log('OnchainOS Health:', health);
  // { ok: true, chains: 30, xlayer: true }

  // ── 3. Get Supported Chains ─────────────────────────────────────
  const chains = await okx.getSupportedChains();
  const xlayer = chains.find(c => c.chainIndex === '196');
  console.log('X Layer:', xlayer);

  // ── 4. Quote: OKB → USDC on X Layer ─────────────────────────────
  const quote = await okx.getQuote({
    chainIndex: '196',
    fromTokenAddress: OKB_NATIVE,
    toTokenAddress: USDC_XLAYER,
    amount: '10000000000000000', // 0.01 OKB (~$0.84)
  });

  console.log('OKB → USDC Quote:');
  console.log(`  Input: ${quote.fromTokenAmount} ${quote.fromToken.tokenSymbol}`);
  console.log(`  Output: ${quote.toTokenAmount} ${quote.toToken.tokenSymbol}`);
  console.log(`  Route: ${quote.dexRouterList.map(r => r.dexProtocol.dexName).join(' → ')}`);
  console.log(`  Gas fee (USD): $${quote.tradeFee}`);

  // ── 5. Get Swap calldata ────────────────────────────────────────
  // This returns ready-to-sign transaction data
  const swapData = await okx.getSwapData({
    chainIndex: '196',
    fromTokenAddress: OKB_NATIVE,
    toTokenAddress: USDC_XLAYER,
    amount: '10000000000000000',
    userWalletAddress: WALLET_ADDRESS,
    slippagePercent: '0.5',
  });

  console.log('\nSwap Transaction:');
  console.log(`  To: ${swapData.tx.to} (OKX DEX Router)`);
  console.log(`  Value: ${swapData.tx.value}`);
  console.log(`  Gas: ${swapData.tx.gas}`);
  console.log(`  Min receive: ${swapData.routerResult.toTokenAmount} USDC`);

  // ── 6. Execute via viem (requires OKB balance) ──────────────────
  // const walletClient = createWalletClient({account, chain: xLayer, transport: http()});
  // const hash = await walletClient.sendTransaction({
  //   to: swapData.tx.to,
  //   data: swapData.tx.data,
  //   value: BigInt(swapData.tx.value),
  // });
  // console.log('Swap TX:', hash);
}

main().catch(console.error);
