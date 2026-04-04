/**
 * FeeCalculator — Compute facilitator fees per transaction.
 *
 * This is the core revenue logic. Every transaction through ASG Pay
 * gets a fee calculated based on:
 * 1. The merchant's pricing plan (dev/growth/scale/enterprise)
 * 2. The payment protocol (x402 vs MPP)
 * 3. The transaction amount (micropayment premiums)
 * 4. Volume discounts
 *
 * Fee = max(amount × feePercent, minFee) + networkCost
 */

import {
  FeeBreakdown,
  PricingPlan,
  PricingTier,
  PRICING_TIERS,
} from './types';

/**
 * Protocol-specific fee adjustments.
 * MPP has higher base cost (Stripe processing underneath).
 */
const PROTOCOL_ADJUSTMENTS: Record<string, number> = {
  x402: 0,      // No adjustment — pure on-chain
  mpp: 0.5,     // +0.5% for Stripe processing layer
};

/**
 * Micropayment premium: transactions under $1 get a higher fee
 * because fixed costs are a larger percentage.
 */
const MICROPAYMENT_THRESHOLD = 1.0;
const MICROPAYMENT_PREMIUM = 0.5; // +0.5%

/**
 * Estimated network costs per chain (gas fees in USD).
 */
const NETWORK_COSTS: Record<string, number> = {
  'eip155:8453': 0.001,      // Base
  'eip155:84532': 0.0001,    // Base Sepolia
  'eip155:42161': 0.002,     // Arbitrum
  'eip155:1': 2.50,          // Ethereum L1
  'eip155:10': 0.001,        // Optimism
  'stellar:pubnet': 0.00001, // Stellar
  'stellar:testnet': 0,      // Stellar testnet
  'solana:mainnet': 0.0005,  // Solana
  'solana:devnet': 0,        // Solana devnet
  'fiat:stripe': 0.30,       // Stripe base fee
};

export class FeeCalculator {
  private tiers: Record<PricingPlan, PricingTier>;

  constructor(customTiers?: Partial<Record<PricingPlan, PricingTier>>) {
    this.tiers = { ...PRICING_TIERS };
    if (customTiers) {
      for (const [plan, tier] of Object.entries(customTiers)) {
        this.tiers[plan as PricingPlan] = tier;
      }
    }
  }

  /**
   * Calculate the full fee breakdown for a transaction.
   */
  calculate(
    amountUsd: number,
    plan: PricingPlan,
    protocol: 'x402' | 'mpp' = 'x402',
    chain: string = 'eip155:8453'
  ): FeeBreakdown {
    const tier = this.tiers[plan];

    // Base fee percent from tier
    let feePercent = tier.feePercent;

    // Protocol adjustment
    feePercent += PROTOCOL_ADJUSTMENTS[protocol] ?? 0;

    // Micropayment premium
    if (amountUsd < MICROPAYMENT_THRESHOLD) {
      feePercent += MICROPAYMENT_PREMIUM;
    }

    // Calculate fee
    const calculatedFee = amountUsd * (feePercent / 100);
    const minFeeApplied = calculatedFee < tier.minFee;
    const finalFee = Math.max(calculatedFee, tier.minFee);

    // Network cost
    const networkCost = NETWORK_COSTS[chain] ?? 0.01;

    // Net revenue (what ASG keeps after network costs)
    const netRevenue = Math.max(0, finalFee - networkCost);

    return {
      baseAmount: amountUsd,
      feePercent,
      calculatedFee: parseFloat(calculatedFee.toFixed(6)),
      minFeeApplied,
      finalFee: parseFloat(finalFee.toFixed(6)),
      networkCost,
      netRevenue: parseFloat(netRevenue.toFixed(6)),
      totalCost: parseFloat((amountUsd + finalFee).toFixed(6)),
    };
  }

  /**
   * Quick fee estimate (just the fee amount, no breakdown).
   */
  estimateFee(
    amountUsd: number,
    plan: PricingPlan = 'growth',
    protocol: 'x402' | 'mpp' = 'x402'
  ): number {
    const breakdown = this.calculate(amountUsd, plan, protocol);
    return breakdown.finalFee;
  }

  /**
   * Calculate net revenue from a transaction (what ASG makes).
   */
  netRevenue(
    amountUsd: number,
    plan: PricingPlan = 'growth',
    protocol: 'x402' | 'mpp' = 'x402',
    chain: string = 'eip155:8453'
  ): number {
    return this.calculate(amountUsd, plan, protocol, chain).netRevenue;
  }

  /**
   * Calculate revenue from N transactions at given plan.
   * Useful for financial modeling.
   */
  projectRevenue(
    avgTransactionUsd: number,
    transactionCount: number,
    plan: PricingPlan,
    protocol: 'x402' | 'mpp' = 'x402',
    chain: string = 'eip155:8453'
  ): {
    grossFees: number;
    networkCosts: number;
    netRevenue: number;
    margin: number;
  } {
    const breakdown = this.calculate(avgTransactionUsd, plan, protocol, chain);
    const grossFees = breakdown.finalFee * transactionCount;
    const networkCosts = breakdown.networkCost * transactionCount;
    const netRevenue = breakdown.netRevenue * transactionCount;
    const margin = grossFees > 0 ? netRevenue / grossFees : 0;

    return {
      grossFees: parseFloat(grossFees.toFixed(2)),
      networkCosts: parseFloat(networkCosts.toFixed(2)),
      netRevenue: parseFloat(netRevenue.toFixed(2)),
      margin: parseFloat((margin * 100).toFixed(1)),
    };
  }

  /**
   * Get the pricing tier for a plan.
   */
  getTier(plan: PricingPlan): PricingTier {
    return { ...this.tiers[plan] };
  }

  /**
   * Get all pricing tiers.
   */
  getAllTiers(): Record<PricingPlan, PricingTier> {
    return { ...this.tiers };
  }
}
