/**
 * Wallet Abstraction Types — Unified multi-chain balance & routing.
 *
 * These types power the UnifiedWallet, which abstracts away chain selection
 * so that AI agents can simply say "pay $5" without knowing which chain,
 * token, or gas mechanics are involved.
 *
 * @see EIP-7702 — Session keys & smart account delegation
 * @see ERC-7521 — Intent-based execution
 * @see ERC-4337 — Account abstraction (paymasters)
 */

import { PaymentAdapter } from '../adapters/types';

// ═══ Routing Strategy ═══════════════════════════════════════════════

/**
 * Strategy for selecting which chain/adapter to route a payment through.
 *
 * - `cheapest`      — Lowest estimated gas/fee (default)
 * - `fastest`       — Fastest expected settlement time
 * - `prefer-crypto` — Prefer on-chain settlement over fiat
 * - `prefer-fiat`   — Prefer Stripe/fiat over on-chain
 * - `round-robin`   — Distribute across adapters evenly
 */
export type RoutingStrategy =
  | 'cheapest'
  | 'fastest'
  | 'prefer-crypto'
  | 'prefer-fiat'
  | 'round-robin';

// ═══ Unified Wallet Options ═════════════════════════════════════════

export interface UnifiedWalletOptions {
  /** All available payment adapters (EVM, Stellar, Solana, Stripe, etc.) */
  adapters: PaymentAdapter[];

  /** Routing strategy for chain selection. Default: 'cheapest' */
  strategy?: RoutingStrategy;

  /** Optional logger. */
  logger?: (msg: string) => void;

  /** Fallback adapter index if routing fails. Default: 0 (first adapter) */
  fallbackIndex?: number;
}

// ═══ Balance Types ══════════════════════════════════════════════════

/** Balance breakdown per chain. */
export interface ChainBalance {
  /** Human-readable chain name. */
  chain: string;
  /** CAIP-2 identifier. */
  caip2Id: string;
  /** Human-readable balance (e.g., "150.00"). */
  balance: string;
  /** Balance in USD equivalent. */
  balanceUsd: number;
  /** Primary asset symbol (e.g., 'USDC'). */
  asset: string;
  /** Adapter index in the adapters array. */
  adapterIndex: number;
}

/** Aggregated balance across all chains. */
export interface UnifiedBalance {
  /** Total USD-equivalent balance across all chains. */
  totalUsd: number;
  /** Human-readable total (e.g., "$400.00"). */
  totalFormatted: string;
  /** Breakdown per chain. */
  breakdown: ChainBalance[];
  /** Timestamp of the balance snapshot. */
  timestamp: Date;
}

// ═══ Payment Intent & Plan ══════════════════════════════════════════

/**
 * A high-level payment intent — what the agent *wants* to do,
 * without specifying *how* to do it.
 */
export interface PayIntent {
  /** Amount in USD (e.g., "5.00"). */
  amount: string;
  /** Destination address (chain-agnostic — router resolves). */
  destination?: string;
  /** Preferred asset. Default: 'USDC' */
  asset?: string;
  /** Optional memo for the payment. */
  memo?: string;
  /** Override routing strategy for this payment. */
  strategy?: RoutingStrategy;
  /** Maximum acceptable fee in USD. */
  maxFeeUsd?: number;
}

/**
 * A resolved payment plan — the concrete execution path
 * chosen by the ChainRouter.
 */
export interface PaymentPlan {
  /** Selected adapter. */
  adapter: PaymentAdapter;
  /** Adapter index. */
  adapterIndex: number;
  /** Chain name. */
  chain: string;
  /** CAIP-2 identifier. */
  caip2Id: string;
  /** Amount in atomic units for this chain. */
  atomicAmount: string;
  /** Estimated fee in USD. */
  estimatedFeeUsd: number;
  /** Total cost = amount + fee. */
  totalCostUsd: number;
  /** Estimated settlement time in seconds. */
  estimatedSettlementSeconds: number;
  /** Score used for ranking (lower = better). */
  score: number;
}

/** Result of a unified payment execution. */
export interface PayResult {
  /** Whether the payment succeeded. */
  success: boolean;
  /** Transaction hash (if successful). */
  transactionHash: string | null;
  /** Chain used. */
  chain: string;
  /** CAIP-2 identifier. */
  caip2Id: string;
  /** Amount paid in USD. */
  amountUsd: string;
  /** Fee paid in USD (estimated). */
  feeUsd: string;
  /** Error message (if failed). */
  error?: string;
}

// ═══ Session Keys (EIP-7702 compatible) ═════════════════════════════

/** Permissions granted to a session key. */
export interface SessionPermissions {
  /** Maximum USD per transaction. */
  maxPerTransaction: number;
  /** Maximum total USD for the session. */
  maxTotal: number;
  /** Allowed destination addresses (empty = all). */
  allowedDestinations?: string[];
  /** Allowed chains (empty = all). */
  allowedChains?: string[];
  /** Session expiry time. */
  expiresAt: Date;
}

/** An active session with scoped permissions. */
export interface Session {
  /** Unique session ID. */
  id: string;
  /** Permissions for this session. */
  permissions: SessionPermissions;
  /** USD spent in this session so far. */
  spent: number;
  /** Number of transactions in this session. */
  txCount: number;
  /** When the session was created. */
  createdAt: Date;
  /** Whether the session is still active. */
  isActive: boolean;
}

// ═══ Chain Metadata (for routing decisions) ═════════════════════════

/** Static metadata about a chain's characteristics. */
export interface ChainMeta {
  /** CAIP-2 identifier. */
  caip2Id: string;
  /** Human-readable chain name. */
  name: string;
  /** Average settlement time in seconds. */
  avgSettlementSeconds: number;
  /** Average fee in USD for a USDC transfer. */
  avgFeeUsd: number;
  /** Is this a fiat rail (e.g., Stripe)? */
  isFiat: boolean;
  /** Priority boost (lower = higher priority). */
  priorityBoost: number;
}
