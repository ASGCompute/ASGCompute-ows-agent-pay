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
export type { PaymentAdapter } from './adapters/types';
