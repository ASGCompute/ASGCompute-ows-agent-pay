/**
 * ASG Pay — Live Demo (Uniswap V3 swap on Base mainnet)
 * 
 * Usage: AGENT_PRIVATE_KEY=0x... node demo/live-swap.js
 * 
 * NEVER hardcode private keys in source files.
 */
const { createWalletClient, createPublicClient, http, parseEther, formatEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error('ERROR: AGENT_PRIVATE_KEY environment variable not set');
  console.error('Usage: AGENT_PRIVATE_KEY=0x... node demo/live-swap.js');
  process.exit(1);
}

const UNISWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

async function main() {
  console.log('\n🔷 ═══ ASG PAY — LIVE DEMO ═══');
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`Agent Wallet: ${account.address}`);
  
  const publicClient = createPublicClient({ chain: base, transport: http() });
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`ETH Balance: ${formatEther(balance)} ETH`);
  
  if (balance === 0n) {
    console.log('No ETH balance — fund the wallet first');
    return;
  }
  
  console.log('Ready to swap via Uniswap V3 on Base');
}

main().catch(console.error);
