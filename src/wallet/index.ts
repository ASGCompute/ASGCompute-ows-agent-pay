// Wallet Abstraction — Barrel exports
export { UnifiedWallet } from './unified-wallet';
export { BalanceAggregator } from './balance-aggregator';
export { ChainRouter } from './chain-router';
export { IntentResolver } from './intent-resolver';
export { SessionManager } from './session-manager';
export type {
  UnifiedWalletOptions,
  UnifiedBalance,
  ChainBalance,
  PayIntent,
  PaymentPlan,
  PayResult,
  RoutingStrategy,
  Session,
  SessionPermissions,
  ChainMeta,
} from './types';
