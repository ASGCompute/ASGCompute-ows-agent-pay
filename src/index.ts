// @asgcard/pay — Production x402/MPP SDK for AI agent payments
// https://pay.asgcard.dev

// Core
export { OwsClient, OWSClientOptions } from './client';
export { PolicyEngine, BudgetPolicy } from './policy';
export type { Logger } from './logger';

// MPP Protocol utilities
export {
  parseMppChallenge,
  parseMppChallenges,
  decodeChallengeRequest,
  buildMppCredential,
  buildAuthorizationHeader,
  parseMppReceipt,
  detectProtocol,
  extractMppChallenges,
  base64urlEncode,
  base64urlDecode,
} from './mpp';
export type {
  MppChallenge,
  MppCredential,
  MppRequestObject,
  MppStripePayload,
  MppTempoPayload,
  MppReceipt,
  MppMethod,
  MppIntent,
} from './mpp';

// Adapters — Universal EVM (recommended for on-chain x402)
export { EvmPaymentAdapter, listEvmChains } from './adapters/evm';
export type { EvmAdapterOptions, EvmChainName } from './adapters/evm';

// Adapters — Stripe MPP (fiat + stablecoins via Shared Payment Tokens)
export { StripePaymentAdapter } from './adapters/stripe';
export type { StripeAdapterOptions } from './adapters/stripe';

// Adapters — Stellar
export { StellarPaymentAdapter } from './adapters/stellar';
export type { StellarPaymentAdapterOptions } from './adapters/stellar';

// Adapters — Solana (SOL + USDC SPL, mainnet/devnet/testnet)
export { SolanaPaymentAdapter } from './adapters/solana';
export type { SolanaAdapterOptions } from './adapters/solana';

// Adapters — Base (backward compat, use EvmPaymentAdapter instead)
export { BasePaymentAdapter } from './adapters/base';
export type { BaseAdapterOptions } from './adapters/base';

// Interface
export type {
  PaymentAdapter,
  WatchOptions,
  IncomingPayment,
  PaymentRequestOptions,
  PaymentRequest,
  Unsubscribe,
} from './adapters/types';

// Server — Pay In: 402 gating middleware
export {
  createX402Gate,
  createMppGate,
  createPaymentGate,
  createWebhookHandler,
  buildReceipt,
} from './server';
export type {
  X402GateConfig,
  X402Proof,
} from './server/x402-gate';
export type {
  MppGateConfig,
} from './server/mpp-gate';
export type {
  PaymentGateConfig,
} from './server/payment-gate';
export type {
  WebhookConfig,
  WebhookEvent,
} from './server/webhook';
export type {
  ReceiptOptions,
  PaymentReceipt,
} from './server/receipt';

// Monitor — Pay In: Real-time payment watchers
export {
  createEvmWatcher,
  createStellarWatcher,
  createSolanaWatcher,
  createMultiChainWatcher,
} from './monitor';
export type { EvmWatcherConfig } from './monitor/evm-watcher';
export type { StellarWatcherConfig } from './monitor/stellar-watcher';
export type { SolanaWatcherConfig } from './monitor/solana-watcher';
export type { MultiChainWatcherConfig } from './monitor/multi-watcher';

// Requests — Pay In: Payment request URI generators
export {
  buildEip681Uri,
  buildSep7Uri,
  buildSolanaPayUri,
  buildPaymentUri,
} from './requests';
export type { Eip681Options } from './requests/eip681';
export type { Sep7Options } from './requests/sep7';
export type { SolanaPayOptions } from './requests/solana-pay';
export type { UniversalPaymentUriOptions } from './requests/universal';
