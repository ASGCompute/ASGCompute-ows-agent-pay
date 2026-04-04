import type { IncomingPayment, Unsubscribe } from '../adapters/types';
import { createEvmWatcher, type EvmWatcherConfig } from './evm-watcher';
import { createStellarWatcher, type StellarWatcherConfig } from './stellar-watcher';
import { createSolanaWatcher, type SolanaWatcherConfig } from './solana-watcher';
import { Logger, noopLogger } from '../logger';

/**
 * Multi-Chain Watcher — monitors multiple chains simultaneously.
 *
 * Aggregates incoming payment events from all configured chains
 * into a single callback, enabling unified cross-chain monitoring.
 */
export interface MultiChainWatcherConfig {
  /** EVM chain configurations. */
  evm?: EvmWatcherConfig[];
  /** Stellar configuration. */
  stellar?: StellarWatcherConfig;
  /** Solana configuration. */
  solana?: SolanaWatcherConfig;
  /** Unified callback for all incoming payments. */
  onPayment: (event: IncomingPayment) => void;
  /** Unified error callback. */
  onError?: (error: Error) => void;
  /** Logger function. */
  logger?: Logger;
}

/**
 * Creates a multi-chain payment watcher.
 *
 * @returns Unsubscribe function that stops ALL chain watchers.
 *
 * @example
 * ```ts
 * const unsub = createMultiChainWatcher({
 *   evm: [
 *     { address: '0x...', rpcUrl: 'https://mainnet.base.org', chainName: 'Base', usdcContractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
 *     { address: '0x...', rpcUrl: 'https://arb1.arbitrum.io/rpc', chainName: 'Arbitrum' },
 *   ],
 *   stellar: { accountId: 'GABCD...' },
 *   solana: { address: '7abc...' },
 *   onPayment: (event) => console.log(`${event.chain}: ${event.amountFormatted} ${event.asset}`),
 * });
 *
 * // Stop all watchers
 * unsub();
 * ```
 */
export function createMultiChainWatcher(config: MultiChainWatcherConfig): Unsubscribe {
  const log = config.logger ?? noopLogger;
  const unsubscribers: Unsubscribe[] = [];

  log('[multi-watcher] 🌐 Starting multi-chain payment monitor…');

  // Start EVM watchers
  if (config.evm) {
    for (const evmConfig of config.evm) {
      const unsub = createEvmWatcher({
        ...evmConfig,
        onPayment: (event) => {
          config.onPayment(event);
          evmConfig.onPayment?.(event);
        },
        onError: (err) => {
          config.onError?.(err);
          evmConfig.onError?.(err);
        },
        logger: evmConfig.logger ?? log,
      });
      unsubscribers.push(unsub);
    }
    log(`[multi-watcher] ⛓️ ${config.evm.length} EVM chain(s) active`);
  }

  // Start Stellar watcher
  if (config.stellar) {
    const unsub = createStellarWatcher({
      ...config.stellar,
      onPayment: (event) => {
        config.onPayment(event);
        config.stellar!.onPayment?.(event);
      },
      onError: (err) => {
        config.onError?.(err);
        config.stellar!.onError?.(err);
      },
      logger: config.stellar.logger ?? log,
    });
    unsubscribers.push(unsub);
    log('[multi-watcher] ⭐ Stellar watcher active');
  }

  // Start Solana watcher
  if (config.solana) {
    const unsub = createSolanaWatcher({
      ...config.solana,
      onPayment: (event) => {
        config.onPayment(event);
        config.solana!.onPayment?.(event);
      },
      onError: (err) => {
        config.onError?.(err);
        config.solana!.onError?.(err);
      },
      logger: config.solana.logger ?? log,
    });
    unsubscribers.push(unsub);
    log('[multi-watcher] ◎ Solana watcher active');
  }

  log(`[multi-watcher] ✅ ${unsubscribers.length} watcher(s) running`);

  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
    log('[multi-watcher] 🛑 All watchers stopped');
  };
}
