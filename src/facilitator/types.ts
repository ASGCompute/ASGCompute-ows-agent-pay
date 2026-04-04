/**
 * Facilitator Types — Hosted payment facilitation with fee extraction.
 *
 * The Facilitator API is the PRIMARY revenue engine. It processes
 * agent payments, extracts a configurable fee (0.5-1.5%), and
 * settles to the merchant.
 *
 * Revenue model:
 * - x402 on-chain: 0.5% facilitator fee
 * - MPP fiat: 1.5% + $0.05
 * - Cross-chain: 1.0%
 * - Micropayments (<$1): 2% (min $0.001)
 *
 * @see Stripe Connect — inspiration for fee model
 */

// ═══ Pricing Tiers ══════════════════════════════════════════════════

/** Pricing plan for API access. */
export type PricingPlan = 'dev' | 'growth' | 'scale' | 'enterprise';

/** Full pricing tier configuration. */
export interface PricingTier {
  plan: PricingPlan;
  /** Monthly base price (USD). */
  monthlyPrice: number;
  /** Included transactions per month. */
  includedTransactions: number;
  /** Price per transaction over the included amount. */
  overageRate: number;
  /** Facilitator fee percentage (0-100). */
  feePercent: number;
  /** Minimum fee per transaction (USD). */
  minFee: number;
  /** Chains available. */
  chains: 'single' | 'all';
  /** Priority routing available. */
  priorityRouting: boolean;
  /** SLA uptime guarantee. */
  slaUptime?: number;
  /** Dedicated infrastructure. */
  dedicatedInfra: boolean;
}

/** Default pricing tiers. */
export const PRICING_TIERS: Record<PricingPlan, PricingTier> = {
  dev: {
    plan: 'dev',
    monthlyPrice: 0,
    includedTransactions: 100,
    overageRate: 0, // no overage on free tier (hard limit)
    feePercent: 1.5,
    minFee: 0.005,
    chains: 'single',
    priorityRouting: false,
    dedicatedInfra: false,
  },
  growth: {
    plan: 'growth',
    monthlyPrice: 49,
    includedTransactions: 10_000,
    overageRate: 0.003,
    feePercent: 1.0,
    minFee: 0.002,
    chains: 'all',
    priorityRouting: false,
    dedicatedInfra: false,
  },
  scale: {
    plan: 'scale',
    monthlyPrice: 199,
    includedTransactions: 100_000,
    overageRate: 0.002,
    feePercent: 0.5,
    minFee: 0.001,
    chains: 'all',
    priorityRouting: true,
    slaUptime: 99.9,
    dedicatedInfra: false,
  },
  enterprise: {
    plan: 'enterprise',
    monthlyPrice: 999,
    includedTransactions: Infinity,
    overageRate: 0,
    feePercent: 0.3,
    minFee: 0.001,
    chains: 'all',
    priorityRouting: true,
    slaUptime: 99.99,
    dedicatedInfra: true,
  },
};

// ═══ API Key ════════════════════════════════════════════════════════

/** API key record for authentication and billing. */
export interface ApiKeyRecord {
  /** API key string (e.g., "asg_live_..."). */
  key: string;
  /** Display name. */
  name: string;
  /** Owner identifier (user/org ID). */
  ownerId: string;
  /** Pricing plan. */
  plan: PricingPlan;
  /** Is the key active? */
  isActive: boolean;
  /** When the key was created. */
  createdAt: Date;
  /** Current billing period start. */
  periodStart: Date;
  /** Current billing period end. */
  periodEnd: Date;
  /** Transactions used this period. */
  transactionsUsed: number;
  /** Total revenue generated for ASG this period. */
  revenueGenerated: number;
  /** Rate limit per minute. */
  rateLimit: number;
  /** Metadata. */
  metadata?: Record<string, string>;
}

// ═══ Facilitation Request/Response ══════════════════════════════════

/** Input to the Facilitator API. */
export interface FacilitateRequest {
  /** Payment protocol to use. */
  protocol: 'x402' | 'mpp' | 'auto';
  /** Amount in USD. */
  amount: string;
  /** Currency (default: USDC). */
  currency?: string;
  /** Merchant/destination address. */
  destination: string;
  /** Routing strategy. */
  routing?: 'cheapest' | 'fastest' | 'prefer-crypto' | 'prefer-fiat';
  /** Preferred chain (CAIP-2 ID). */
  preferredChain?: string;
  /** Agent DID (optional, for identity tracking). */
  agentDid?: string;
  /** Idempotency key. */
  idempotencyKey?: string;
  /** Memo/reference. */
  memo?: string;
}

/** Successful facilitation response. */
export interface FacilitateResponse {
  /** Was the payment successful? */
  success: boolean;
  /** Unique facilitation ID. */
  facilitationId: string;
  /** Transaction hash (if on-chain). */
  transactionHash: string | null;
  /** Protocol used. */
  protocol: 'x402' | 'mpp';
  /** Chain used. */
  chain: string;
  /** CAIP-2 chain ID. */
  caip2Id: string;
  /** Amount settled to merchant (USD). */
  amountSettled: string;
  /** ASG facilitator fee (USD). */
  fee: string;
  /** Fee percentage applied. */
  feePercent: number;
  /** Total cost to agent (amount + fee). */
  totalCost: string;
  /** Settlement status. */
  settlement: 'instant' | 'pending' | 'failed';
  /** Timestamp. */
  timestamp: Date;
  /** Error message (if failed). */
  error?: string;
}

// ═══ Fee Breakdown ══════════════════════════════════════════════════

/** Detailed fee calculation. */
export interface FeeBreakdown {
  /** Base amount (USD). */
  baseAmount: number;
  /** Fee percentage applied. */
  feePercent: number;
  /** Calculated fee (USD). */
  calculatedFee: number;
  /** Minimum fee applied? */
  minFeeApplied: boolean;
  /** Final fee (USD). */
  finalFee: number;
  /** Gas/network cost estimate (USD). */
  networkCost: number;
  /** ASG net revenue from this tx. */
  netRevenue: number;
  /** Total cost to agent. */
  totalCost: number;
}

// ═══ Usage & Billing ════════════════════════════════════════════════

/** Usage record for a billing period. */
export interface UsageRecord {
  /** API key. */
  apiKey: string;
  /** Billing period start. */
  periodStart: Date;
  /** Billing period end. */
  periodEnd: Date;
  /** Total transactions. */
  totalTransactions: number;
  /** Included transactions (from plan). */
  includedTransactions: number;
  /** Overage transactions. */
  overageTransactions: number;
  /** Total volume processed (USD). */
  totalVolume: number;
  /** Total fees collected (USD). */
  totalFees: number;
  /** Overage charges (USD). */
  overageCharges: number;
  /** Subscription charge (USD). */
  subscriptionCharge: number;
  /** Grand total billing amount. */
  totalBilling: number;
}

// ═══ Revenue Dashboard ══════════════════════════════════════════════

/** Revenue summary for the operator. */
export interface RevenueSummary {
  /** Time period. */
  period: 'day' | 'week' | 'month' | 'all-time';
  /** Total transactions processed. */
  totalTransactions: number;
  /** Total payment volume (USD). */
  totalVolume: number;
  /** Total fees collected (USD). */
  totalFees: number;
  /** Total subscription revenue (USD). */
  subscriptionRevenue: number;
  /** Total overage revenue (USD). */
  overageRevenue: number;
  /** Grand total revenue (USD). */
  totalRevenue: number;
  /** Average transaction size (USD). */
  avgTransactionSize: number;
  /** Average fee per transaction (USD). */
  avgFee: number;
  /** Active API keys. */
  activeKeys: number;
  /** Breakdown by protocol. */
  byProtocol: {
    x402: { count: number; volume: number; fees: number };
    mpp: { count: number; volume: number; fees: number };
  };
  /** Breakdown by chain. */
  byChain: Record<string, { count: number; volume: number; fees: number }>;
}

// ═══ ASG Card Tiers ═════════════════════════════════════════════════

/** Card pricing plan. */
export type CardPlan = 'starter' | 'pro' | 'business' | 'enterprise';

/** Card tier configuration. */
export interface CardTier {
  plan: CardPlan;
  /** Monthly subscription price. */
  monthlyPrice: number;
  /** Maximum virtual cards. */
  maxCards: number;
  /** Per-card spending limit (USD/month). */
  perCardLimit: number;
  /** Estimated interchange rate (%). */
  interchangeRate: number;
}

/** Default card tiers. */
export const CARD_TIERS: Record<CardPlan, CardTier> = {
  starter: {
    plan: 'starter',
    monthlyPrice: 0,
    maxCards: 1,
    perCardLimit: 100,
    interchangeRate: 1.5,
  },
  pro: {
    plan: 'pro',
    monthlyPrice: 29,
    maxCards: 10,
    perCardLimit: 1_000,
    interchangeRate: 1.7,
  },
  business: {
    plan: 'business',
    monthlyPrice: 99,
    maxCards: 50,
    perCardLimit: 10_000,
    interchangeRate: 2.0,
  },
  enterprise: {
    plan: 'enterprise',
    monthlyPrice: 499,
    maxCards: Infinity,
    perCardLimit: Infinity,
    interchangeRate: 2.0,
  },
};
