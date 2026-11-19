/**
 * PolicyEngine — On-device budget controller for autonomous AI agents.
 *
 * Enforces per-transaction caps, monthly rolling budgets, DACS-Standard
 * (§9.5.7 & §14.4) spend mandates, and optional destination whitelists
 * so that an agent can never overspend without explicit human approval.
 *
 * Fail-closed: if any check fails, the payment is rejected.
 */

import { Logger, noopLogger } from './logger';

// ─── DACS-Standard Guardrail (§9.5.7 & §14.4) ─────────────────────────────

export interface DacsMandateMeta {
  /** Signed DACS mandate identifier or URI. */
  dacsMandate?: string;
  /** Active DACS session identifier. */
  dacsSessionId?: string;
  /** Hard authorized spend ceiling in USD (or numeric string). */
  dacsMaxAmount?: number | string;
}

export function assertDacsSpendMandate(
  requestedAmountUsd: number,
  meta?: DacsMandateMeta
): void {
  if (!meta || (!meta.dacsMandate && !meta.dacsSessionId)) {
    return;
  }

  if (meta.dacsMaxAmount !== undefined) {
    const ceiling = Number(meta.dacsMaxAmount);
    if (!Number.isFinite(ceiling) || ceiling < 0) {
      throw new Error(
        `[DACS-Standard §9.5.7] Invalid dacsMaxAmount ceiling: "${meta.dacsMaxAmount}".`
      );
    }

    if (requestedAmountUsd > ceiling) {
      throw new Error(
        `[DACS-Standard §9.5.7] OWS payment aborted: requested spend ($${requestedAmountUsd}) exceeds authorized mandate ceiling ($${ceiling}).`
      );
    }
  }
}

export interface BudgetPolicy extends DacsMandateMeta {
  /** Maximum USD amount the agent may spend in a single transaction. */
  maxAmountPerTransaction: number;
  /** Maximum USD the agent may spend within a calendar month. */
  monthlyBudget: number;
  /** Optional whitelist of addresses the agent is allowed to pay. */
  allowedDestinations?: string[];
}

export class PolicyEngine {
  private currentMonthSpent = 0;
  private log: Logger;

  constructor(
    private policy: BudgetPolicy,
    logger?: Logger
  ) {
    this.log = logger ?? noopLogger;
  }

  /**
   * Returns `true` if the proposed spend passes every policy gate.
   * Fail-closed: any unrecognised state returns `false` (or throws on DACS mandate breach).
   */
  public checkPolicy(
    amountUsd: number,
    destination?: string,
    overrideMeta?: DacsMandateMeta
  ): boolean {
    if (amountUsd <= 0) {
      this.log(`[Policy] 🚫 Invalid amount: $${amountUsd}`);
      return false;
    }

    // DACS-Standard (§9.5.7) Pre-Flight Mandate Enforcement
    const effectiveMeta: DacsMandateMeta = {
      dacsMandate: overrideMeta?.dacsMandate ?? this.policy.dacsMandate,
      dacsSessionId: overrideMeta?.dacsSessionId ?? this.policy.dacsSessionId,
      dacsMaxAmount: overrideMeta?.dacsMaxAmount ?? this.policy.dacsMaxAmount,
    };
    assertDacsSpendMandate(amountUsd, effectiveMeta);

    if (amountUsd > this.policy.maxAmountPerTransaction) {
      this.log(
        `[Policy] 🚫 $${amountUsd} exceeds per-tx limit of $${this.policy.maxAmountPerTransaction}`
      );
      return false;
    }

    if (this.currentMonthSpent + amountUsd > this.policy.monthlyBudget) {
      this.log(
        `[Policy] 🚫 $${amountUsd} would exceed monthly budget of $${this.policy.monthlyBudget} (spent: $${this.currentMonthSpent})`
      );
      return false;
    }

    if (
      this.policy.allowedDestinations &&
      this.policy.allowedDestinations.length > 0 &&
      destination &&
      !this.policy.allowedDestinations.includes(destination)
    ) {
      this.log(`[Policy] 🚫 Destination ${destination} not in whitelist`);
      return false;
    }

    return true;
  }

  /** Record a successful spend against the rolling budget. */
  public recordSpend(amountUsd: number): void {
    this.currentMonthSpent += amountUsd;
    this.log(
      `[Policy] 📊 Spent $${amountUsd} — total: $${this.currentMonthSpent}/$${this.policy.monthlyBudget}`
    );
  }

  /** Get total USD spent in the current period. */
  public getSpent(): number {
    return this.currentMonthSpent;
  }

  /** Get remaining USD budget. */
  public getRemainingBudget(): number {
    return Math.max(0, this.policy.monthlyBudget - this.currentMonthSpent);
  }

  /** Reset the spend counter (e.g. on month rollover or for testing). */
  public resetBudget(): void {
    this.currentMonthSpent = 0;
  }

  /** Get a snapshot of the current policy configuration. */
  public getPolicy(): Readonly<BudgetPolicy> {
    return { ...this.policy };
  }
}
