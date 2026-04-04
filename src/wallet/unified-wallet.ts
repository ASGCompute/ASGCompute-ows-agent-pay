/**
 * UnifiedWallet — Single entry point for multi-chain payments.
 *
 * Wraps multiple PaymentAdapters behind a unified interface so that
 * AI agents can simply call `wallet.pay('$5')` without knowing about
 * chains, tokens, gas, or atomic units.
 *
 * Architecture:
 * ```
 * Agent → UnifiedWallet → ChainRouter → best PaymentAdapter → settlement
 *                       → BalanceAggregator → unified balance
 *                       → IntentResolver → structured payment intent
 *                       → SessionManager → scoped permissions
 * ```
 *
 * @example
 * ```ts
 * const wallet = new UnifiedWallet({
 *   adapters: [evmAdapter, stellarAdapter, solanaAdapter],
 *   strategy: 'cheapest',
 * });
 *
 * // Agent just pays — no chain knowledge needed
 * const result = await wallet.pay({ amount: '5.00' });
 * ```
 *
 * @see EIP-7702 — Smart account delegation
 * @see ERC-7521 — Intent-based execution
 */

import { PaymentAdapter } from '../adapters/types';
import { BalanceAggregator } from './balance-aggregator';
import { ChainRouter } from './chain-router';
import { IntentResolver } from './intent-resolver';
import { SessionManager } from './session-manager';
import {
  UnifiedWalletOptions,
  UnifiedBalance,
  PayIntent,
  PayResult,
  PaymentPlan,
  RoutingStrategy,
  Session,
  SessionPermissions,
} from './types';

export class UnifiedWallet {
  private adapters: PaymentAdapter[];
  private strategy: RoutingStrategy;
  private log: (msg: string) => void;
  private fallbackIndex: number;

  readonly balanceAggregator: BalanceAggregator;
  readonly chainRouter: ChainRouter;
  readonly intentResolver: IntentResolver;
  readonly sessionManager: SessionManager;

  constructor(options: UnifiedWalletOptions) {
    if (!options.adapters || options.adapters.length === 0) {
      throw new Error('UnifiedWallet requires at least one adapter');
    }

    this.adapters = options.adapters;
    this.strategy = options.strategy ?? 'cheapest';
    this.log = options.logger ?? (() => {});
    this.fallbackIndex = options.fallbackIndex ?? 0;

    this.balanceAggregator = new BalanceAggregator(this.adapters);
    this.chainRouter = new ChainRouter(this.adapters);
    this.intentResolver = new IntentResolver();
    this.sessionManager = new SessionManager();
  }

  // ═══ Core API ═════════════════════════════════════════════════════

  /**
   * Execute a payment using the optimal chain route.
   * The agent simply provides an amount — everything else is automatic.
   */
  async pay(intent: PayIntent): Promise<PayResult> {
    const strategy = intent.strategy ?? this.strategy;
    this.log(`[Wallet] 💳 Pay intent: $${intent.amount} (strategy: ${strategy})`);

    // Validate intent
    const validation = this.intentResolver.validate(intent);
    if (!validation.valid) {
      return {
        success: false,
        transactionHash: null,
        chain: 'none',
        caip2Id: 'none',
        amountUsd: intent.amount,
        feeUsd: '0',
        error: validation.errors.join('; '),
      };
    }

    // Route to best chain
    const plan = this.chainRouter.getBestPlan(intent, strategy);

    if (!plan) {
      this.log('[Wallet] ❌ No viable route found');
      return {
        success: false,
        transactionHash: null,
        chain: 'none',
        caip2Id: 'none',
        amountUsd: intent.amount,
        feeUsd: '0',
        error: 'No viable payment route found',
      };
    }

    this.log(`[Wallet] 🔀 Routed to ${plan.chain} (${plan.caip2Id}), fee: $${plan.estimatedFeeUsd}`);

    // Execute payment
    return this.executePlan(plan, intent);
  }

  /**
   * Pay using a natural-language string.
   * @example wallet.payIntent('pay $5 to 0x1234...')
   */
  async payIntent(intentString: string): Promise<PayResult> {
    this.log(`[Wallet] 🧠 Resolving intent: "${intentString}"`);
    const intent = this.intentResolver.resolve(intentString);
    return this.pay(intent);
  }

  // ═══ Balance API ══════════════════════════════════════════════════

  /**
   * Get the unified balance across all chains.
   */
  async getBalance(): Promise<UnifiedBalance> {
    return this.balanceAggregator.getUnifiedBalance();
  }

  /**
   * Get the total USD balance as a simple number.
   */
  async getTotalBalanceUsd(): Promise<number> {
    const balance = await this.balanceAggregator.getUnifiedBalance();
    return balance.totalUsd;
  }

  /**
   * Check if the wallet has enough funds for a payment.
   */
  async canAfford(amountUsd: number): Promise<boolean> {
    return this.balanceAggregator.hasSufficientFunds(amountUsd);
  }

  // ═══ Routing API ══════════════════════════════════════════════════

  /**
   * Preview all routing options for a payment without executing.
   */
  previewRoutes(intent: PayIntent): PaymentPlan[] {
    const strategy = intent.strategy ?? this.strategy;
    return this.chainRouter.route(intent, strategy);
  }

  /**
   * Get the default routing strategy.
   */
  getStrategy(): RoutingStrategy {
    return this.strategy;
  }

  /**
   * Change the default routing strategy.
   */
  setStrategy(strategy: RoutingStrategy): void {
    this.strategy = strategy;
    this.log(`[Wallet] ⚙️ Strategy changed to: ${strategy}`);
  }

  // ═══ Session API (EIP-7702 compatible) ════════════════════════════

  /**
   * Create a scoped session for this wallet.
   */
  createSession(permissions: SessionPermissions): Session {
    const session = this.sessionManager.createSession(permissions);
    this.log(`[Wallet] 🔑 Session created: ${session.id} (max: $${permissions.maxTotal})`);
    return session;
  }

  /**
   * Revoke a session.
   */
  revokeSession(sessionId: string): boolean {
    const revoked = this.sessionManager.revokeSession(sessionId);
    if (revoked) {
      this.log(`[Wallet] 🚫 Session revoked: ${sessionId}`);
    }
    return revoked;
  }

  // ═══ Adapter Access ═══════════════════════════════════════════════

  /**
   * Get the primary address (first adapter's address).
   */
  getAddress(): string {
    return this.adapters[0].getAddress();
  }

  /**
   * Get all adapter addresses.
   */
  getAddresses(): Array<{ chain: string; caip2Id: string; address: string }> {
    return this.adapters.map((a) => ({
      chain: a.chainName,
      caip2Id: a.caip2Id,
      address: a.getAddress(),
    }));
  }

  /**
   * Get the number of registered adapters.
   */
  getAdapterCount(): number {
    return this.adapters.length;
  }

  /**
   * Get a specific adapter by CAIP-2 ID.
   */
  getAdapter(caip2Id: string): PaymentAdapter | undefined {
    return this.adapters.find((a) => a.caip2Id === caip2Id);
  }

  /**
   * Expose the underlying adapter for OwsClient backward compatibility.
   * Returns the first (default) adapter.
   */
  getDefaultAdapter(): PaymentAdapter {
    return this.adapters[this.fallbackIndex] ?? this.adapters[0];
  }

  // ═══ Internal ═════════════════════════════════════════════════════

  /**
   * Execute a resolved payment plan.
   */
  private async executePlan(plan: PaymentPlan, intent: PayIntent): Promise<PayResult> {
    const destination = intent.destination ?? plan.adapter.getAddress();

    try {
      const txHash = await plan.adapter.pay(
        destination,
        plan.atomicAmount,
        plan.caip2Id
      );

      if (txHash) {
        this.log(`[Wallet] ✅ Payment settled on ${plan.chain}: ${txHash}`);
        return {
          success: true,
          transactionHash: txHash,
          chain: plan.chain,
          caip2Id: plan.caip2Id,
          amountUsd: intent.amount,
          feeUsd: plan.estimatedFeeUsd.toFixed(4),
        };
      }

      // Primary route failed — try fallback
      return this.tryFallback(intent, plan.adapterIndex);
    } catch (error) {
      this.log(`[Wallet] ⚠️ ${plan.chain} failed: ${(error as Error).message}`);
      return this.tryFallback(intent, plan.adapterIndex);
    }
  }

  /**
   * Fallback: try next-best adapter if primary fails.
   */
  private async tryFallback(intent: PayIntent, excludeIndex: number): Promise<PayResult> {
    const strategy = intent.strategy ?? this.strategy;
    const allPlans = this.chainRouter.route(intent, strategy);
    const fallbackPlans = allPlans.filter((p) => p.adapterIndex !== excludeIndex);

    if (fallbackPlans.length === 0) {
      return {
        success: false,
        transactionHash: null,
        chain: 'none',
        caip2Id: 'none',
        amountUsd: intent.amount,
        feeUsd: '0',
        error: 'All payment routes failed',
      };
    }

    this.log(`[Wallet] 🔄 Falling back to ${fallbackPlans[0].chain}`);
    return this.executePlan(fallbackPlans[0], intent);
  }
}
