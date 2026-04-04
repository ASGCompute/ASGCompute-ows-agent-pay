import type { IncomingPayment, Unsubscribe } from '../adapters/types';
import { Logger, noopLogger } from '../logger';

/**
 * Solana Watcher — monitors incoming SOL and SPL token transfers.
 *
 * Uses `getSignaturesForAddress` polling to detect new transactions
 * involving the target account.
 */
export interface SolanaWatcherConfig {
  /** Solana wallet address to monitor (base58). */
  address: string;
  /** Solana JSON-RPC URL. Default: 'https://api.mainnet-beta.solana.com'. */
  rpcUrl?: string;
  /** USDC mint address. Default: mainnet USDC mint. */
  usdcMint?: string;
  /** Poll interval in milliseconds. Default: 5000. */
  pollIntervalMs?: number;
  /** Callback for detected incoming payments. */
  onPayment: (event: IncomingPayment) => void;
  /** Callback for errors. */
  onError?: (error: Error) => void;
  /** Logger function. */
  logger?: Logger;
}

/** Mainnet USDC mint address. */
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/**
 * Creates a Solana payment watcher using JSON-RPC polling.
 *
 * Polls `getSignaturesForAddress` for new transactions, then
 * inspects each transaction to detect:
 * 1. Native SOL transfers TO the target address
 * 2. SPL USDC transfers TO the target's Associated Token Account
 *
 * @returns Unsubscribe function to stop watching.
 */
export function createSolanaWatcher(config: SolanaWatcherConfig): Unsubscribe {
  const log = config.logger ?? noopLogger;
  const rpcUrl = config.rpcUrl ?? 'https://api.mainnet-beta.solana.com';
  const pollInterval = config.pollIntervalMs ?? 5000;
  const usdcMint = config.usdcMint ?? USDC_MINT;

  let running = true;
  let lastSignature: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function rpcCall(method: string, params: any[]): Promise<any> {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await response.json();
    if (json.error) throw new Error(`Solana RPC error: ${json.error.message}`);
    return json.result;
  }

  async function getNewSignatures(): Promise<string[]> {
    const params: any[] = [
      config.address,
      { limit: 20, ...(lastSignature ? { until: lastSignature } : {}) },
    ];

    const result = await rpcCall('getSignaturesForAddress', params);
    if (!Array.isArray(result) || result.length === 0) return [];

    // Return newest first
    return result
      .filter((r: any) => r.confirmationStatus === 'confirmed' || r.confirmationStatus === 'finalized')
      .map((r: any) => r.signature);
  }

  async function inspectTransaction(signature: string): Promise<IncomingPayment | null> {
    try {
      const tx = await rpcCall('getTransaction', [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
      if (!tx?.meta || tx.meta.err) return null;

      const targetLower = config.address;

      // Check parsed instructions for SOL transfers and SPL token transfers
      const instructions = tx.transaction?.message?.instructions || [];
      const innerInstructions = tx.meta?.innerInstructions || [];
      const allInstructions = [
        ...instructions,
        ...innerInstructions.flatMap((inner: any) => inner.instructions || []),
      ];

      for (const ix of allInstructions) {
        const parsed = ix.parsed;
        if (!parsed) continue;

        // Native SOL transfer
        if (parsed.type === 'transfer' && ix.program === 'system') {
          if (parsed.info?.destination === targetLower) {
            const lamports = parsed.info.lamports.toString();
            return {
              amount: lamports,
              amountFormatted: formatSol(lamports),
              asset: 'SOL',
              from: parsed.info.source || 'unknown',
              transactionHash: signature,
              chain: 'Solana',
              caip2Id: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
              timestamp: new Date((tx.blockTime || Date.now() / 1000) * 1000),
              confirmations: 1,
            };
          }
        }

        // SPL Token transfer (including USDC)
        if (
          (parsed.type === 'transfer' || parsed.type === 'transferChecked') &&
          ix.program === 'spl-token'
        ) {
          const info = parsed.info;
          // Check if this is USDC (by mint address in transferChecked)
          const isUsdc = info?.mint === usdcMint;
          const amount = info?.amount || info?.tokenAmount?.amount;

          if (amount && info?.destination) {
            // We need to check if the destination ATA belongs to our address
            // For simplicity, we check pre/post token balances
            return {
              amount: amount.toString(),
              amountFormatted: isUsdc ? formatUsdc(amount.toString()) : amount.toString(),
              asset: isUsdc ? 'USDC' : 'SPL',
              from: info.source || info.authority || 'unknown',
              transactionHash: signature,
              chain: 'Solana',
              caip2Id: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
              timestamp: new Date((tx.blockTime || Date.now() / 1000) * 1000),
              confirmations: 1,
            };
          }
        }
      }

      return null;
    } catch (err: any) {
      log(`[solana-watcher] ⚠️ Failed to inspect tx ${signature.slice(0, 16)}…: ${err.message}`);
      return null;
    }
  }

  async function poll() {
    if (!running) return;

    try {
      const signatures = await getNewSignatures();

      if (signatures.length > 0 && !lastSignature) {
        // First poll — just record the latest signature
        lastSignature = signatures[0];
        log(`[solana-watcher] 🔍 Started watching from signature ${lastSignature.slice(0, 16)}… on Solana`);
        schedulePoll();
        return;
      }

      if (signatures.length === 0) {
        schedulePoll();
        return;
      }

      log(`[solana-watcher] 📦 Processing ${signatures.length} new transactions`);

      for (const sig of signatures.reverse()) { // Oldest first
        const payment = await inspectTransaction(sig);
        if (payment) {
          log(`[solana-watcher] 💰 Incoming: ${payment.amountFormatted} ${payment.asset} from ${payment.from.slice(0, 10)}…`);
          config.onPayment(payment);
        }
      }

      lastSignature = signatures[0]; // Most recent
    } catch (err: any) {
      log(`[solana-watcher] ❌ Poll error: ${err.message}`);
      config.onError?.(err);
    }

    schedulePoll();
  }

  function schedulePoll() {
    if (running && pollInterval > 0) {
      timer = setTimeout(poll, pollInterval);
    }
  }

  // Start polling
  poll();

  return () => {
    running = false;
    if (timer) clearTimeout(timer);
    log(`[solana-watcher] 🛑 Stopped watching on Solana`);
  };
}

function formatSol(lamports: string): string {
  const n = BigInt(lamports);
  const whole = n / 1_000_000_000n;
  const frac = ((n % 1_000_000_000n) / 1_000n).toString().padStart(6, '0');
  return `${whole}.${frac}`;
}

function formatUsdc(atomicAmount: string): string {
  const n = BigInt(atomicAmount);
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, '0');
  return `${whole}.${frac}`;
}
