import type { IncomingPayment, Unsubscribe } from '../adapters/types';
import { Logger, noopLogger } from '../logger';

/**
 * EVM Watcher — monitors incoming ERC-20 (USDC) and native ETH transfers.
 *
 * Uses polling-based approach compatible with any JSON-RPC provider.
 * For WebSocket-capable providers, set `pollIntervalMs` to 0 and provide
 * a WebSocket URL to enable real-time event subscription.
 */
export interface EvmWatcherConfig {
  /** Wallet address to monitor for incoming payments. */
  address: string;
  /** JSON-RPC URL for the EVM chain. */
  rpcUrl: string;
  /** CAIP-2 chain identifier (e.g., 'eip155:8453'). */
  chainId?: string;
  /** Human-readable chain name. Default: 'EVM'. */
  chainName?: string;
  /** USDC contract address on this chain. If omitted, only native ETH transfers are watched. */
  usdcContractAddress?: string;
  /** Poll interval in milliseconds. Default: 12000 (one block on Base). */
  pollIntervalMs?: number;
  /** Callback for detected incoming payments. */
  onPayment: (event: IncomingPayment) => void;
  /** Callback for errors. */
  onError?: (error: Error) => void;
  /** Logger function. */
  logger?: Logger;
}

/**
 * ERC-20 Transfer event topic hash.
 * keccak256('Transfer(address,address,uint256)')
 */
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Creates an EVM payment watcher using JSON-RPC polling.
 *
 * Monitors:
 * 1. ERC-20 Transfer events TO the target address (USDC)
 * 2. Native ETH transfers TO the target address (via block scanning)
 *
 * @returns Unsubscribe function to stop watching.
 */
export function createEvmWatcher(config: EvmWatcherConfig): Unsubscribe {
  const log = config.logger ?? noopLogger;
  const pollInterval = config.pollIntervalMs ?? 12000;
  const chainName = config.chainName ?? 'EVM';
  const chainId = config.chainId ?? 'eip155:1';

  let running = true;
  let lastBlock = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function rpcCall(method: string, params: any[]): Promise<any> {
    const response = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await response.json();
    if (json.error) throw new Error(`RPC error: ${json.error.message}`);
    return json.result;
  }

  async function getLatestBlock(): Promise<number> {
    const hex = await rpcCall('eth_blockNumber', []);
    return parseInt(hex, 16);
  }

  async function getErc20Transfers(fromBlock: number, toBlock: number): Promise<IncomingPayment[]> {
    if (!config.usdcContractAddress) return [];

    const paddedAddress = '0x' + config.address.slice(2).toLowerCase().padStart(64, '0');

    const logs = await rpcCall('eth_getLogs', [{
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: '0x' + toBlock.toString(16),
      address: config.usdcContractAddress,
      topics: [TRANSFER_TOPIC, null, paddedAddress],
    }]);

    if (!Array.isArray(logs)) return [];

    return logs.map((logEntry: any) => {
      const amount = BigInt(logEntry.data).toString();
      const from = '0x' + logEntry.topics[1].slice(26);

      return {
        amount,
        amountFormatted: formatUsdc(amount),
        asset: 'USDC',
        from,
        transactionHash: logEntry.transactionHash,
        chain: chainName,
        caip2Id: chainId,
        timestamp: new Date(),
        confirmations: 1,
      };
    });
  }

  async function getNativeTransfers(fromBlock: number, toBlock: number): Promise<IncomingPayment[]> {
    const payments: IncomingPayment[] = [];
    const targetLower = config.address.toLowerCase();

    for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
      try {
        const block = await rpcCall('eth_getBlockByNumber', ['0x' + blockNum.toString(16), true]);
        if (!block?.transactions) continue;

        for (const tx of block.transactions) {
          if (
            tx.to?.toLowerCase() === targetLower &&
            tx.value && tx.value !== '0x0' && tx.value !== '0x'
          ) {
            const amount = BigInt(tx.value).toString();
            payments.push({
              amount,
              amountFormatted: formatEth(amount),
              asset: 'ETH',
              from: tx.from,
              transactionHash: tx.hash,
              chain: chainName,
              caip2Id: chainId,
              timestamp: new Date(parseInt(block.timestamp, 16) * 1000),
              confirmations: 1,
            });
          }
        }
      } catch (err: any) {
        log(`[evm-watcher] ⚠️ Error scanning block ${blockNum}: ${err.message}`);
      }
    }

    return payments;
  }

  async function poll() {
    if (!running) return;

    try {
      const currentBlock = await getLatestBlock();

      if (lastBlock === 0) {
        lastBlock = currentBlock;
        log(`[evm-watcher] 🔍 Started watching from block ${currentBlock} on ${chainName}`);
        schedulePoll();
        return;
      }

      if (currentBlock <= lastBlock) {
        schedulePoll();
        return;
      }

      const fromBlock = lastBlock + 1;
      const toBlock = currentBlock;

      log(`[evm-watcher] 📦 Scanning blocks ${fromBlock}–${toBlock} on ${chainName}`);

      // Scan for ERC-20 and native transfers in parallel
      const [erc20Payments, nativePayments] = await Promise.all([
        getErc20Transfers(fromBlock, toBlock),
        getNativeTransfers(fromBlock, toBlock),
      ]);

      const allPayments = [...erc20Payments, ...nativePayments];

      for (const payment of allPayments) {
        log(`[evm-watcher] 💰 Incoming: ${payment.amountFormatted} ${payment.asset} from ${payment.from.slice(0, 10)}…`);
        config.onPayment(payment);
      }

      lastBlock = toBlock;
    } catch (err: any) {
      log(`[evm-watcher] ❌ Poll error: ${err.message}`);
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

  // Return unsubscribe function
  return () => {
    running = false;
    if (timer) clearTimeout(timer);
    log(`[evm-watcher] 🛑 Stopped watching on ${chainName}`);
  };
}

function formatUsdc(atomicAmount: string): string {
  const n = BigInt(atomicAmount);
  const whole = n / 1000000n;
  const frac = (n % 1000000n).toString().padStart(6, '0');
  return `${whole}.${frac}`;
}

function formatEth(weiAmount: string): string {
  const n = BigInt(weiAmount);
  const whole = n / 10n ** 18n;
  const frac = ((n % 10n ** 18n) / 10n ** 12n).toString().padStart(6, '0');
  return `${whole}.${frac}`;
}
