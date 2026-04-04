/**
 * ASG Pay — Real-Time Payment Monitoring
 *
 * Chain-specific watchers that detect incoming payments
 * and invoke callbacks in real-time.
 *
 * @example
 * ```ts
 * import { createEvmWatcher, createStellarWatcher } from '@asgcard/pay/monitor';
 *
 * const unsub = createEvmWatcher({
 *   address: '0xYOUR_WALLET',
 *   rpcUrl: 'https://mainnet.base.org',
 *   onPayment: (event) => console.log('Received:', event),
 * });
 *
 * // Stop watching
 * unsub();
 * ```
 */
export { createEvmWatcher, type EvmWatcherConfig } from './evm-watcher';
export { createStellarWatcher, type StellarWatcherConfig } from './stellar-watcher';
export { createSolanaWatcher, type SolanaWatcherConfig } from './solana-watcher';
export { createMultiChainWatcher, type MultiChainWatcherConfig } from './multi-watcher';
