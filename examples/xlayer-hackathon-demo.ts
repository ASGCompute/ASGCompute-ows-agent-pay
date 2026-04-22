/**
 * ASG Pay — Hackathon Demo: X Layer Transactions
 * 
 * Executes live transactions on X Layer mainnet to demonstrate:
 * 1. OnchainOS DEX swap (OKB → USDC)
 * 2. Direct payment on X Layer
 * 3. Cross-chain awareness
 * 
 * Usage:
 *   AGENT_PRIVATE_KEY=0x... npx ts-node examples/xlayer-hackathon-demo.ts
 * 
 * Required: OKB on X Layer for gas
 */

import * as crypto from 'crypto';
import * as https from 'https';
import { createWalletClient, createPublicClient, http, formatEther, parseEther, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ─── Config (from env, NEVER hardcoded) ─────────────────────────────

const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error('❌ Set AGENT_PRIVATE_KEY in environment');
  process.exit(1);
}

const OKX_API_KEY = process.env.OKX_API_KEY;
const OKX_SECRET = process.env.OKX_SECRET_KEY;
const OKX_PASS = process.env.OKX_PASSPHRASE;

// ─── X Layer Chain Definition ───────────────────────────────────────

const xlayer: Chain = {
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.xlayer.tech'] } },
  blockExplorers: { default: { name: 'OKLink', url: 'https://www.oklink.com/xlayer' } },
};

// X Layer token addresses
const USDC_XLAYER = '0x74b7f16337b8972027f6196a17a631ac6de26d22';
const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const;

// ─── OnchainOS API ──────────────────────────────────────────────────

function signRequest(method: string, path: string, qs: string = '', body: string = '') {
  const timestamp = new Date().toISOString();
  const preHash = timestamp + method + path + (method === 'GET' ? qs : body);
  const signature = crypto.createHmac('sha256', OKX_SECRET!).update(preHash).digest('base64');
  return {
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': OKX_API_KEY!,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': OKX_PASS!,
  };
}

function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    const qs = params ? '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') : '';
    const headers = signRequest('GET', path, qs);
    const req = https.request({ hostname: 'web3.okx.com', path: path + qs, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.code === '0') resolve(parsed.data);
          else reject(new Error(`API ${parsed.code}: ${parsed.msg}`));
        } catch { reject(new Error('Parse error')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── Main Demo ──────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  🏦 ASG Pay — X Layer Hackathon Demo            ║');
  console.log('║  OnchainOS Integration + Live Transactions       ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // Setup wallet
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  const publicClient = createPublicClient({ chain: xlayer, transport: http() });
  const walletClient = createWalletClient({ account, chain: xlayer, transport: http() });

  console.log(`  Agent Wallet: ${account.address}`);
  console.log(`  Network:      X Layer (Chain ID: 196)`);

  // Step 1: Check balances
  console.log('');
  console.log('─── Step 1: Check Balances ─────────────────────────');
  const okbBalance = await publicClient.getBalance({ address: account.address });
  console.log(`  OKB:  ${formatEther(okbBalance)} OKB`);

  if (okbBalance === 0n) {
    console.log('');
    console.log('  ⚠️  No OKB for gas! Please send OKB to:');
    console.log(`  ${account.address}`);
    console.log('  on X Layer (Chain ID: 196)');
    console.log('');
    console.log('  Minimum needed: ~0.01 OKB (~$0.85)');
    return;
  }

  try {
    const usdcBalance = await publicClient.readContract({
      address: USDC_XLAYER as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    });
    console.log(`  USDC: ${(Number(usdcBalance) / 1e6).toFixed(6)} USDC`);
  } catch {
    console.log('  USDC: could not read');
  }

  // Step 2: OnchainOS DEX Quote
  console.log('');
  console.log('─── Step 2: OnchainOS DEX Quote ────────────────────');

  if (OKX_API_KEY && OKX_SECRET && OKX_PASS) {
    try {
      const swapAmount = (okbBalance / 10n).toString(); // Use 10% of balance
      console.log(`  Quoting: ${formatEther(BigInt(swapAmount))} OKB → USDC`);

      const quoteData = await apiGet<any[]>('/api/v6/dex/aggregator/quote', {
        chainIndex: '196',
        fromTokenAddress: NATIVE,
        toTokenAddress: USDC_XLAYER,
        amount: swapAmount,
      });

      const quote = quoteData[0];
      const outputUsdc = (Number(quote.routerResult?.toTokenAmount || quote.toTokenAmount) / 1e6).toFixed(6);
      console.log(`  Quote:  → ${outputUsdc} USDC`);
      console.log(`  DEX:    ${quote.routerResult?.dexRouterList?.[0]?.router?.dexName || 'OnchainOS Aggregated'}`);
      console.log(`  ✅ OnchainOS DEX integration verified`);

      // Step 3: Execute swap via OnchainOS
      console.log('');
      console.log('─── Step 3: Execute Swap ───────────────────────────');

      const swapData = await apiGet<any[]>('/api/v6/dex/aggregator/swap', {
        chainIndex: '196',
        fromTokenAddress: NATIVE,
        toTokenAddress: USDC_XLAYER,
        amount: swapAmount,
        userWalletAddress: account.address,
        slippagePercent: '1',
      });

      const swap = swapData[0];
      if (swap?.tx) {
        console.log(`  Router: ${swap.tx.to}`);
        console.log(`  Gas:    ${swap.tx.gas}`);

        const txHash = await walletClient.sendTransaction({
          to: swap.tx.to as `0x${string}`,
          data: swap.tx.data as `0x${string}`,
          value: BigInt(swap.tx.value || '0'),
          gas: BigInt(swap.tx.gas || '300000'),
        });

        console.log(`  ✅ Swap TX: ${txHash}`);
        console.log(`  Explorer: https://www.oklink.com/xlayer/tx/${txHash}`);

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`  Status:  ${receipt.status === 'success' ? '✅ Confirmed' : '❌ Failed'}`);
        console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
      }
    } catch (e: any) {
      console.log(`  ⚠️ Swap error: ${e.message}`);
    }
  } else {
    console.log('  ⚠️ Set OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE for DEX');
  }

  // Step 4: Direct payment on X Layer (send small OKB)
  console.log('');
  console.log('─── Step 4: Direct Payment on X Layer ──────────────');
  const paymentAmount = parseEther('0.0001'); // ~$0.01

  if (okbBalance > paymentAmount * 2n) {
    // Send to self as demo payment
    const payTx = await walletClient.sendTransaction({
      to: account.address, // self-transfer for demo
      value: paymentAmount,
    });

    console.log(`  ✅ Payment TX: ${payTx}`);
    console.log(`  Amount:  0.0001 OKB`);
    console.log(`  Explorer: https://www.oklink.com/xlayer/tx/${payTx}`);

    const payReceipt = await publicClient.waitForTransactionReceipt({ hash: payTx });
    console.log(`  Status:  ${payReceipt.status === 'success' ? '✅ Confirmed' : '❌ Failed'}`);
  } else {
    console.log('  ⚠️ Insufficient OKB for demo payment');
  }

  // Final summary
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  ✅ ASG Pay X Layer Demo Complete!');
  console.log('');

  const finalOkb = await publicClient.getBalance({ address: account.address });
  console.log(`  Final OKB: ${formatEther(finalOkb)}`);

  try {
    const finalUsdc = await publicClient.readContract({
      address: USDC_XLAYER as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    });
    console.log(`  Final USDC: ${(Number(finalUsdc) / 1e6).toFixed(6)}`);
  } catch {}

  console.log('═══════════════════════════════════════════════════');
}

main().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
