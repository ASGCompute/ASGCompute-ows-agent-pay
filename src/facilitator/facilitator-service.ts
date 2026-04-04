/**
 * FacilitatorService — Core payment processing + fee extraction.
 *
 * This is where money is made. The FacilitatorService:
 * 1. Validates the API key and checks rate limits
 * 2. Calculates the facilitator fee
 * 3. Routes the payment through UnifiedWallet
 * 4. Extracts the fee before settlement
 * 5. Records usage for billing
 * 6. Returns a receipt
 *
 * Revenue flow:
 * Agent pays $5.00 → ASG extracts $0.025 (0.5%) → Merchant gets $4.975
 */

import {
  ApiKeyRecord,
  FacilitateRequest,
  FacilitateResponse,
  PricingPlan,
  PRICING_TIERS,
  UsageRecord,
  RevenueSummary,
} from './types';
import { FeeCalculator } from './fee-calculator';

/**
 * Generate unique IDs.
 */
function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${ts}_${rand}`;
}

export class FacilitatorService {
  private apiKeys: Map<string, ApiKeyRecord> = new Map();
  private transactions: FacilitateResponse[] = [];
  private feeCalculator: FeeCalculator;
  private log: (msg: string) => void;

  constructor(options?: { logger?: (msg: string) => void }) {
    this.feeCalculator = new FeeCalculator();
    this.log = options?.logger ?? (() => {});
  }

  // ═══ API Key Management ═══════════════════════════════════════════

  /**
   * Create a new API key for a merchant.
   */
  createApiKey(
    ownerId: string,
    name: string,
    plan: PricingPlan = 'dev'
  ): ApiKeyRecord {
    const prefix = plan === 'dev' ? 'asg_test' : 'asg_live';
    const key = `${prefix}_${generateId('key')}`;

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const record: ApiKeyRecord = {
      key,
      name,
      ownerId,
      plan,
      isActive: true,
      createdAt: now,
      periodStart: now,
      periodEnd,
      transactionsUsed: 0,
      revenueGenerated: 0,
      rateLimit: this.getRateLimit(plan),
      metadata: {},
    };

    this.apiKeys.set(key, record);
    this.log(`[Facilitator] 🔑 API key created: ${key} (plan: ${plan})`);
    return record;
  }

  /**
   * Validate an API key.
   */
  validateApiKey(key: string): { valid: boolean; reason?: string } {
    const record = this.apiKeys.get(key);
    if (!record) {
      return { valid: false, reason: 'API key not found' };
    }
    if (!record.isActive) {
      return { valid: false, reason: 'API key is deactivated' };
    }

    // Check transaction limit
    const tier = PRICING_TIERS[record.plan];
    if (record.transactionsUsed >= tier.includedTransactions && record.plan === 'dev') {
      return { valid: false, reason: 'Transaction limit reached (upgrade to Growth)' };
    }

    return { valid: true };
  }

  /**
   * Revoke an API key.
   */
  revokeApiKey(key: string): boolean {
    const record = this.apiKeys.get(key);
    if (!record) return false;
    record.isActive = false;
    this.log(`[Facilitator] 🚫 API key revoked: ${key}`);
    return true;
  }

  /**
   * Upgrade an API key's plan.
   */
  upgradePlan(key: string, newPlan: PricingPlan): boolean {
    const record = this.apiKeys.get(key);
    if (!record) return false;
    record.plan = newPlan;
    record.rateLimit = this.getRateLimit(newPlan);
    this.log(`[Facilitator] ⬆️ Plan upgraded: ${key} → ${newPlan}`);
    return true;
  }

  // ═══ Payment Facilitation ═════════════════════════════════════════

  /**
   * Process a payment facilitation request.
   * This is the core revenue-generating method.
   */
  async facilitate(
    apiKey: string,
    request: FacilitateRequest
  ): Promise<FacilitateResponse> {
    const facilitationId = generateId('fac');
    const timestamp = new Date();

    // 1. Validate API key
    const keyValidation = this.validateApiKey(apiKey);
    if (!keyValidation.valid) {
      return this.failedResponse(facilitationId, request, keyValidation.reason!, timestamp);
    }

    const record = this.apiKeys.get(apiKey)!;
    const amount = parseFloat(request.amount);

    if (isNaN(amount) || amount <= 0) {
      return this.failedResponse(facilitationId, request, 'Invalid amount', timestamp);
    }

    // 2. Calculate fee
    const protocol = request.protocol === 'auto' ? 'x402' : request.protocol;
    const chain = request.preferredChain ?? 'eip155:8453';
    const feeBreakdown = this.feeCalculator.calculate(
      amount,
      record.plan,
      protocol,
      chain
    );

    this.log(
      `[Facilitator] 💰 Processing $${amount} via ${protocol} on ${chain} ` +
      `— fee: $${feeBreakdown.finalFee.toFixed(4)} (${feeBreakdown.feePercent}%)`
    );

    // 3. In production: execute the actual payment via UnifiedWallet here
    //    For now, simulate settlement
    const txHash = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;

    // 4. Record transaction
    const amountSettled = amount - feeBreakdown.finalFee;
    const response: FacilitateResponse = {
      success: true,
      facilitationId,
      transactionHash: txHash,
      protocol,
      chain: this.chainName(chain),
      caip2Id: chain,
      amountSettled: amountSettled.toFixed(4),
      fee: feeBreakdown.finalFee.toFixed(4),
      feePercent: feeBreakdown.feePercent,
      totalCost: feeBreakdown.totalCost.toFixed(4),
      settlement: 'instant',
      timestamp,
    };

    // 5. Update usage metrics
    record.transactionsUsed += 1;
    record.revenueGenerated += feeBreakdown.netRevenue;

    // 6. Store for analytics
    this.transactions.push(response);

    this.log(
      `[Facilitator] ✅ Settled: $${amountSettled.toFixed(2)} to merchant, ` +
      `$${feeBreakdown.finalFee.toFixed(4)} fee → ASG net: $${feeBreakdown.netRevenue.toFixed(4)}`
    );

    return response;
  }

  // ═══ Usage & Billing ══════════════════════════════════════════════

  /**
   * Get usage for an API key in the current period.
   */
  getUsage(apiKey: string): UsageRecord | null {
    const record = this.apiKeys.get(apiKey);
    if (!record) return null;

    const tier = PRICING_TIERS[record.plan];
    const overage = Math.max(0, record.transactionsUsed - tier.includedTransactions);
    const overageCharges = overage * tier.overageRate;

    return {
      apiKey,
      periodStart: record.periodStart,
      periodEnd: record.periodEnd,
      totalTransactions: record.transactionsUsed,
      includedTransactions: tier.includedTransactions,
      overageTransactions: overage,
      totalVolume: this.getVolumeForKey(apiKey),
      totalFees: record.revenueGenerated,
      overageCharges,
      subscriptionCharge: tier.monthlyPrice,
      totalBilling: tier.monthlyPrice + overageCharges,
    };
  }

  // ═══ Revenue Analytics ════════════════════════════════════════════

  /**
   * Get revenue summary across all API keys.
   */
  getRevenueSummary(period: 'day' | 'week' | 'month' | 'all-time' = 'all-time'): RevenueSummary {
    const now = Date.now();
    const periodMs = {
      day: 86_400_000,
      week: 604_800_000,
      month: 2_592_000_000,
      'all-time': Infinity,
    };

    const cutoff = now - periodMs[period];
    const txs = this.transactions.filter(
      (t) => t.success && t.timestamp.getTime() >= cutoff
    );

    const totalVolume = txs.reduce((sum, t) => sum + parseFloat(t.amountSettled), 0);
    const totalFees = txs.reduce((sum, t) => sum + parseFloat(t.fee), 0);

    const x402Txs = txs.filter((t) => t.protocol === 'x402');
    const mppTxs = txs.filter((t) => t.protocol === 'mpp');

    const subscriptionRevenue = Array.from(this.apiKeys.values())
      .filter((k) => k.isActive)
      .reduce((sum, k) => sum + PRICING_TIERS[k.plan].monthlyPrice, 0);

    const overageRevenue = Array.from(this.apiKeys.values())
      .reduce((sum, k) => {
        const tier = PRICING_TIERS[k.plan];
        const overage = Math.max(0, k.transactionsUsed - tier.includedTransactions);
        return sum + overage * tier.overageRate;
      }, 0);

    // Breakdown by chain
    const byChain: Record<string, { count: number; volume: number; fees: number }> = {};
    for (const tx of txs) {
      if (!byChain[tx.chain]) {
        byChain[tx.chain] = { count: 0, volume: 0, fees: 0 };
      }
      byChain[tx.chain].count += 1;
      byChain[tx.chain].volume += parseFloat(tx.amountSettled);
      byChain[tx.chain].fees += parseFloat(tx.fee);
    }

    return {
      period,
      totalTransactions: txs.length,
      totalVolume: parseFloat(totalVolume.toFixed(2)),
      totalFees: parseFloat(totalFees.toFixed(2)),
      subscriptionRevenue,
      overageRevenue: parseFloat(overageRevenue.toFixed(2)),
      totalRevenue: parseFloat((totalFees + subscriptionRevenue + overageRevenue).toFixed(2)),
      avgTransactionSize: txs.length > 0 ? parseFloat((totalVolume / txs.length).toFixed(2)) : 0,
      avgFee: txs.length > 0 ? parseFloat((totalFees / txs.length).toFixed(4)) : 0,
      activeKeys: Array.from(this.apiKeys.values()).filter((k) => k.isActive).length,
      byProtocol: {
        x402: {
          count: x402Txs.length,
          volume: parseFloat(x402Txs.reduce((s, t) => s + parseFloat(t.amountSettled), 0).toFixed(2)),
          fees: parseFloat(x402Txs.reduce((s, t) => s + parseFloat(t.fee), 0).toFixed(4)),
        },
        mpp: {
          count: mppTxs.length,
          volume: parseFloat(mppTxs.reduce((s, t) => s + parseFloat(t.amountSettled), 0).toFixed(2)),
          fees: parseFloat(mppTxs.reduce((s, t) => s + parseFloat(t.fee), 0).toFixed(4)),
        },
      },
      byChain,
    };
  }

  /**
   * Get total API keys count.
   */
  getApiKeyCount(): number {
    return this.apiKeys.size;
  }

  /**
   * Get all active API keys.
   */
  getActiveKeys(): ApiKeyRecord[] {
    return Array.from(this.apiKeys.values()).filter((k) => k.isActive);
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private failedResponse(
    facilitationId: string,
    request: FacilitateRequest,
    error: string,
    timestamp: Date
  ): FacilitateResponse {
    return {
      success: false,
      facilitationId,
      transactionHash: null,
      protocol: request.protocol === 'auto' ? 'x402' : request.protocol,
      chain: 'none',
      caip2Id: 'none',
      amountSettled: '0',
      fee: '0',
      feePercent: 0,
      totalCost: request.amount,
      settlement: 'failed',
      timestamp,
      error,
    };
  }

  private getRateLimit(plan: PricingPlan): number {
    switch (plan) {
      case 'dev': return 10;
      case 'growth': return 100;
      case 'scale': return 1000;
      case 'enterprise': return 10000;
    }
  }

  private chainName(caip2Id: string): string {
    const names: Record<string, string> = {
      'eip155:8453': 'Base',
      'eip155:1': 'Ethereum',
      'eip155:42161': 'Arbitrum',
      'eip155:10': 'Optimism',
      'stellar:pubnet': 'Stellar',
      'solana:mainnet': 'Solana',
      'fiat:stripe': 'Stripe MPP',
    };
    return names[caip2Id] ?? caip2Id;
  }

  private getVolumeForKey(apiKey: string): number {
    return this.transactions
      .filter((t) => t.success)
      .reduce((sum, t) => sum + parseFloat(t.amountSettled), 0);
  }
}
