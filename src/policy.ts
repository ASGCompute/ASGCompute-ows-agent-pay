/**
 * PolicyEngine — On-device budget controller for autonomous AI agents.
 *
 * Enforces per-transaction caps, monthly rolling budgets, and optional
 * destination whitelists so that an agent can never overspend without
 * explicit human approval.
 */

export interface BudgetPolicy {
  /** Maximum USD amount the agent may spend in a single transaction. */
  maxAmountPerTransaction: number;
  /** Maximum USD the agent may spend within a calendar month. */
  monthlyBudget: number;
  /** Optional whitelist of Stellar addresses the agent is allowed to pay. */
  allowedDestinations?: string[];
}

export class PolicyEngine {
  private currentMonthSpent = 0;

  constructor(private policy: BudgetPolicy) {}

  /**
   * Returns `true` if the proposed spend passes every policy gate.
   */
  public checkPolicy(amountUsd: number, destination?: string): boolean {
    if (amountUsd > this.policy.maxAmountPerTransaction) {
      console.error(
        `[Policy] 🚫 $${amountUsd} exceeds per-tx limit of $${this.policy.maxAmountPerTransaction}`
      );
      return false;
    }

    if (this.currentMonthSpent + amountUsd > this.policy.monthlyBudget) {
      console.error(
        `[Policy] 🚫 $${amountUsd} would exceed monthly budget of $${this.policy.monthlyBudget} (spent: $${this.currentMonthSpent})`
      );
      return false;
    }

    if (
      this.policy.allowedDestinations &&
      destination &&
      !this.policy.allowedDestinations.includes(destination)
    ) {
      console.error(`[Policy] 🚫 Destination ${destination} not in whitelist`);
      return false;
    }

    return true;
  }

  /** Record a successful spend against the rolling budget. */
  public recordSpend(amountUsd: number) {
    this.currentMonthSpent += amountUsd;
    console.log(
      `[Policy] 📊 Spent $${amountUsd} — total: $${this.currentMonthSpent}/$${this.policy.monthlyBudget}`
    );
  }
}
