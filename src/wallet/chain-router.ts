/**
 * ChainRouter — Optimal chain selection for payment execution.
 *
 * Given a payment intent ($5 USDC), the router scores all available
 * adapters based on the configured strategy (cheapest, fastest,
 * prefer-crypto, etc.) and returns a ranked list of PaymentPlans.
 *
 * Scoring is based on chain metadata (gas estimates, settlement times)
 * and real-time balance availability.
 *
 * @see ERC-7521 — Intent-based execution patterns
 */

import { PaymentAdapter } from '../adapters/types';
import {
  ChainMeta,
  PayIntent,
  PaymentPlan,
  RoutingStrategy,
} from './types';

/**
 * Default chain metadata for known chains.
 * These are best-effort estimates; production systems should
 * query live gas oracles and fee estimators.
 */
const DEFAULT_CHAIN_META: Record<string, ChainMeta> = {
  // EVM L2s
  'eip155:8453': {
    caip2Id: 'eip155:8453',
    name: 'Base',
    avgSettlementSeconds: 2,
    avgFeeUsd: 0.001,
    isFiat: false,
    priorityBoost: 0,
  },
  'eip155:84532': {
    caip2Id: 'eip155:84532',
    name: 'Base Sepolia',
    avgSettlementSeconds: 2,
    avgFeeUsd: 0.0001,
    isFiat: false,
    priorityBoost: 0,
  },
  'eip155:42161': {
    caip2Id: 'eip155:42161',
    name: 'Arbitrum',
    avgSettlementSeconds: 2,
    avgFeeUsd: 0.002,
    isFiat: false,
    priorityBoost: 0,
  },
  'eip155:1': {
    caip2Id: 'eip155:1',
    name: 'Ethereum',
    avgSettlementSeconds: 15,
    avgFeeUsd: 2.5,
    isFiat: false,
    priorityBoost: 5, // penalise due to high gas
  },
  'eip155:10': {
    caip2Id: 'eip155:10',
    name: 'Optimism',
    avgSettlementSeconds: 2,
    avgFeeUsd: 0.001,
    isFiat: false,
    priorityBoost: 0,
  },

  // Stellar
  'stellar:pubnet': {
    caip2Id: 'stellar:pubnet',
    name: 'Stellar',
    avgSettlementSeconds: 5,
    avgFeeUsd: 0.00001,
    isFiat: false,
    priorityBoost: 0,
  },
  'stellar:testnet': {
    caip2Id: 'stellar:testnet',
    name: 'Stellar Testnet',
    avgSettlementSeconds: 5,
    avgFeeUsd: 0,
    isFiat: false,
    priorityBoost: 0,
  },

  // Solana
  'solana:mainnet': {
    caip2Id: 'solana:mainnet',
    name: 'Solana',
    avgSettlementSeconds: 1,
    avgFeeUsd: 0.0005,
    isFiat: false,
    priorityBoost: 0,
  },
  'solana:devnet': {
    caip2Id: 'solana:devnet',
    name: 'Solana Devnet',
    avgSettlementSeconds: 1,
    avgFeeUsd: 0,
    isFiat: false,
    priorityBoost: 0,
  },

  // Fiat
  'fiat:stripe': {
    caip2Id: 'fiat:stripe',
    name: 'Stripe MPP',
    avgSettlementSeconds: 3,
    avgFeeUsd: 0.30, // Stripe minimum fee
    isFiat: true,
    priorityBoost: 0,
  },
};

/**
 * USDC decimals per chain for atomic unit conversion.
 */
const USDC_DECIMALS: Record<string, number> = {
  'eip155:8453': 6,
  'eip155:84532': 6,
  'eip155:42161': 6,
  'eip155:1': 6,
  'eip155:10': 6,
  'stellar:pubnet': 7,
  'stellar:testnet': 7,
  'solana:mainnet': 6,
  'solana:devnet': 6,
  'fiat:stripe': 2,
};

export class ChainRouter {
  private chainMeta: Map<string, ChainMeta>;
  private roundRobinIndex = 0;

  constructor(
    private adapters: PaymentAdapter[],
    customMeta?: Record<string, ChainMeta>
  ) {
    this.chainMeta = new Map();

    // Load defaults
    for (const [key, meta] of Object.entries(DEFAULT_CHAIN_META)) {
      this.chainMeta.set(key, meta);
    }

    // Override with custom metadata
    if (customMeta) {
      for (const [key, meta] of Object.entries(customMeta)) {
        this.chainMeta.set(key, meta);
      }
    }
  }

  /**
   * Score and rank all adapters for a given payment intent.
   * Returns plans sorted by score (lower = better).
   */
  route(intent: PayIntent, strategy: RoutingStrategy): PaymentPlan[] {
    const amountUsd = parseFloat(intent.amount);
    if (isNaN(amountUsd) || amountUsd <= 0) {
      return [];
    }

    const plans: PaymentPlan[] = this.adapters.map((adapter, index) => {
      const meta = this.getChainMeta(adapter.caip2Id);
      const atomicAmount = this.toAtomicUnits(amountUsd, adapter.caip2Id);

      return {
        adapter,
        adapterIndex: index,
        chain: adapter.chainName,
        caip2Id: adapter.caip2Id,
        atomicAmount,
        estimatedFeeUsd: meta.avgFeeUsd,
        totalCostUsd: amountUsd + meta.avgFeeUsd,
        estimatedSettlementSeconds: meta.avgSettlementSeconds,
        score: this.calculateScore(meta, strategy, index),
      };
    });

    // Apply max fee filter
    const maxFee = intent.maxFeeUsd;
    const filtered = maxFee !== undefined
      ? plans.filter((p) => p.estimatedFeeUsd <= maxFee)
      : plans;

    // Sort by score (lower is better)
    return filtered.sort((a, b) => a.score - b.score);
  }

  /**
   * Get the single best adapter for a payment intent.
   */
  getBestPlan(intent: PayIntent, strategy: RoutingStrategy): PaymentPlan | null {
    const plans = this.route(intent, strategy);
    return plans.length > 0 ? plans[0] : null;
  }

  /**
   * Get chain metadata for a CAIP-2 ID.
   * Falls back to sensible defaults for unknown chains.
   */
  getChainMeta(caip2Id: string): ChainMeta {
    return this.chainMeta.get(caip2Id) ?? {
      caip2Id,
      name: 'Unknown',
      avgSettlementSeconds: 30,
      avgFeeUsd: 0.01,
      isFiat: false,
      priorityBoost: 10,
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────

  /**
   * Calculate a composite score for an adapter/chain based on the strategy.
   * Lower score = better.
   */
  private calculateScore(
    meta: ChainMeta,
    strategy: RoutingStrategy,
    adapterIndex: number
  ): number {
    let score = meta.priorityBoost;

    switch (strategy) {
      case 'cheapest':
        // Weight: 80% fee, 20% speed
        score += meta.avgFeeUsd * 1000 + meta.avgSettlementSeconds * 0.1;
        break;

      case 'fastest':
        // Weight: 80% speed, 20% fee
        score += meta.avgSettlementSeconds * 10 + meta.avgFeeUsd * 100;
        break;

      case 'prefer-crypto':
        // Penalise fiat rails
        score += meta.isFiat ? 1000 : 0;
        score += meta.avgFeeUsd * 500 + meta.avgSettlementSeconds * 0.5;
        break;

      case 'prefer-fiat':
        // Penalise crypto rails
        score += meta.isFiat ? 0 : 1000;
        score += meta.avgFeeUsd * 500 + meta.avgSettlementSeconds * 0.5;
        break;

      case 'round-robin':
        // Cycle through adapters
        score = adapterIndex === this.roundRobinIndex ? 0 : adapterIndex + 1;
        this.roundRobinIndex = (this.roundRobinIndex + 1) % this.adapters.length;
        break;
    }

    return score;
  }

  /**
   * Convert a USD amount to atomic units for a specific chain.
   */
  private toAtomicUnits(amountUsd: number, caip2Id: string): string {
    const decimals = USDC_DECIMALS[caip2Id] ?? 6;
    const atomic = Math.round(amountUsd * Math.pow(10, decimals));
    return atomic.toString();
  }
}
