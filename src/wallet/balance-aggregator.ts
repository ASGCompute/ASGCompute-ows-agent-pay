/**
 * BalanceAggregator — Multi-chain balance aggregation.
 *
 * Queries all registered adapters in parallel to produce a unified
 * balance snapshot. Handles adapters that don't implement `getBalance()`
 * gracefully (returns 0).
 *
 * @example
 * ```ts
 * const aggregator = new BalanceAggregator(adapters);
 * const balance = await aggregator.getUnifiedBalance();
 * console.log(balance.totalFormatted); // "$400.00"
 * ```
 */

import { PaymentAdapter } from '../adapters/types';
import { ChainBalance, UnifiedBalance } from './types';

/**
 * Known stablecoin tickers treated as 1:1 USD.
 * All others use best-effort conversion.
 */
const STABLECOIN_TICKERS = new Set([
  'USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'PYUSD', 'USD',
]);

/**
 * Rough USD conversion rates for non-stablecoin assets.
 * Used only when precise oracle data is unavailable.
 */
const FALLBACK_RATES: Record<string, number> = {
  ETH: 3200,
  XLM: 0.12,
  SOL: 170,
  BTC: 95000,
  MATIC: 0.55,
  AVAX: 35,
  ARB: 1.1,
  OP: 2.5,
};

export class BalanceAggregator {
  constructor(private adapters: PaymentAdapter[]) {}

  /**
   * Query all adapters and return a unified balance snapshot.
   * Adapters without `getBalance()` report $0.
   */
  async getUnifiedBalance(): Promise<UnifiedBalance> {
    const results = await Promise.allSettled(
      this.adapters.map((adapter, index) => this.queryAdapter(adapter, index))
    );

    const breakdown: ChainBalance[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        breakdown.push(result.value);
      }
      // Silently skip failed adapters — fail-open for balance reads
    }

    const totalUsd = breakdown.reduce((sum, b) => sum + b.balanceUsd, 0);

    return {
      totalUsd,
      totalFormatted: `$${totalUsd.toFixed(2)}`,
      breakdown,
      timestamp: new Date(),
    };
  }

  /**
   * Get the balance for a specific chain by CAIP-2 ID.
   */
  async getChainBalance(caip2Id: string): Promise<ChainBalance | null> {
    const index = this.adapters.findIndex((a) => a.caip2Id === caip2Id);
    if (index === -1) return null;
    return this.queryAdapter(this.adapters[index], index);
  }

  /**
   * Find the adapter with the highest USD balance.
   */
  async getRichestChain(): Promise<ChainBalance | null> {
    const unified = await this.getUnifiedBalance();
    if (unified.breakdown.length === 0) return null;
    return unified.breakdown.reduce((richest, current) =>
      current.balanceUsd > richest.balanceUsd ? current : richest
    );
  }

  /**
   * Check if sufficient funds exist across all chains.
   */
  async hasSufficientFunds(amountUsd: number): Promise<boolean> {
    const unified = await this.getUnifiedBalance();
    return unified.totalUsd >= amountUsd;
  }

  /**
   * Find all chains that can cover a given USD amount.
   */
  async getChainsWithSufficientFunds(amountUsd: number): Promise<ChainBalance[]> {
    const unified = await this.getUnifiedBalance();
    return unified.breakdown.filter((b) => b.balanceUsd >= amountUsd);
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private async queryAdapter(adapter: PaymentAdapter, index: number): Promise<ChainBalance> {
    let balance = '0';
    let asset = 'USDC'; // default assumption

    if (adapter.getBalance) {
      try {
        balance = await adapter.getBalance();
      } catch {
        balance = '0';
      }
    }

    // Detect asset from chain name heuristics
    asset = this.detectPrimaryAsset(adapter.chainName);

    const balanceNum = parseFloat(balance) || 0;
    const balanceUsd = this.toUsd(balanceNum, asset);

    return {
      chain: adapter.chainName,
      caip2Id: adapter.caip2Id,
      balance: balanceNum.toFixed(2),
      balanceUsd,
      asset,
      adapterIndex: index,
    };
  }

  /**
   * Convert an asset amount to USD using stablecoin 1:1 or fallback rates.
   */
  private toUsd(amount: number, asset: string): number {
    if (STABLECOIN_TICKERS.has(asset.toUpperCase())) {
      return amount;
    }
    const rate = FALLBACK_RATES[asset.toUpperCase()] ?? 1;
    return amount * rate;
  }

  /**
   * Best-effort detection of the primary asset for a chain.
   */
  private detectPrimaryAsset(chainName: string): string {
    const lower = chainName.toLowerCase();
    if (lower.includes('stripe') || lower.includes('fiat')) return 'USD';
    if (lower.includes('stellar')) return 'USDC'; // Stellar USDC
    if (lower.includes('solana')) return 'USDC'; // SPL USDC
    if (lower.includes('bitcoin')) return 'BTC';
    return 'USDC'; // Default for EVM chains (Base, Arb, etc.)
  }
}
