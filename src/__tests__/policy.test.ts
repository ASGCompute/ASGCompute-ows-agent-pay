import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEngine, BudgetPolicy } from '../policy';

describe('PolicyEngine', () => {
  let policy: BudgetPolicy;
  let engine: PolicyEngine;

  beforeEach(() => {
    policy = {
      maxAmountPerTransaction: 5.0,
      monthlyBudget: 50.0,
      allowedDestinations: ['0xAAA', '0xBBB', 'GABC123'],
    };
    engine = new PolicyEngine(policy);
  });

  // ── Basic approval ────────────────────────────────────────────────
  describe('checkPolicy', () => {
    it('approves a valid spend within limits', () => {
      expect(engine.checkPolicy(1.0, '0xAAA')).toBe(true);
    });

    it('approves without destination if no whitelist check needed', () => {
      const openEngine = new PolicyEngine({
        maxAmountPerTransaction: 5.0,
        monthlyBudget: 50.0,
      });
      expect(openEngine.checkPolicy(3.0)).toBe(true);
    });

    it('approves when destination is in whitelist', () => {
      expect(engine.checkPolicy(2.0, 'GABC123')).toBe(true);
    });
  });

  // ── Per-transaction limit ─────────────────────────────────────────
  describe('per-transaction limit', () => {
    it('rejects amount exceeding per-tx limit', () => {
      expect(engine.checkPolicy(6.0, '0xAAA')).toBe(false);
    });

    it('rejects amount exactly equal to limit + epsilon', () => {
      expect(engine.checkPolicy(5.01, '0xAAA')).toBe(false);
    });

    it('approves amount exactly at limit', () => {
      expect(engine.checkPolicy(5.0, '0xAAA')).toBe(true);
    });
  });

  // ── Monthly budget ────────────────────────────────────────────────
  describe('monthly budget', () => {
    it('rejects when cumulative spend would exceed budget', () => {
      engine.recordSpend(48.0);
      expect(engine.checkPolicy(3.0, '0xAAA')).toBe(false);
    });

    it('approves when cumulative spend fits exactly in budget', () => {
      engine.recordSpend(45.0);
      expect(engine.checkPolicy(5.0, '0xAAA')).toBe(true);
    });

    it('tracks multiple spends correctly', () => {
      engine.recordSpend(10.0);
      engine.recordSpend(20.0);
      engine.recordSpend(15.0);
      expect(engine.getSpent()).toBe(45.0);
      expect(engine.getRemainingBudget()).toBe(5.0);
    });
  });

  // ── Whitelist ─────────────────────────────────────────────────────
  describe('destination whitelist', () => {
    it('rejects destination not in whitelist', () => {
      expect(engine.checkPolicy(1.0, '0xEVIL')).toBe(false);
    });

    it('approves when no whitelist is configured', () => {
      const openEngine = new PolicyEngine({
        maxAmountPerTransaction: 5.0,
        monthlyBudget: 50.0,
      });
      expect(openEngine.checkPolicy(1.0, '0xANYTHING')).toBe(true);
    });

    it('approves when whitelist exists but no destination is provided', () => {
      expect(engine.checkPolicy(1.0)).toBe(true);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('rejects zero amount', () => {
      expect(engine.checkPolicy(0, '0xAAA')).toBe(false);
    });

    it('rejects negative amount', () => {
      expect(engine.checkPolicy(-5, '0xAAA')).toBe(false);
    });
  });

  // ── Budget accessors ──────────────────────────────────────────────
  describe('budget accessors', () => {
    it('getSpent returns 0 initially', () => {
      expect(engine.getSpent()).toBe(0);
    });

    it('getRemainingBudget returns full budget initially', () => {
      expect(engine.getRemainingBudget()).toBe(50.0);
    });

    it('resetBudget clears all spend', () => {
      engine.recordSpend(30.0);
      expect(engine.getSpent()).toBe(30.0);
      engine.resetBudget();
      expect(engine.getSpent()).toBe(0);
      expect(engine.getRemainingBudget()).toBe(50.0);
    });

    it('getPolicy returns immutable copy', () => {
      const p = engine.getPolicy();
      expect(p.maxAmountPerTransaction).toBe(5.0);
      expect(p.monthlyBudget).toBe(50.0);
      expect(p.allowedDestinations).toEqual(['0xAAA', '0xBBB', 'GABC123']);
    });
  });

  // ── Logger ────────────────────────────────────────────────────────
  describe('logger', () => {
    it('is silent by default (no throw on operations)', () => {
      const silentEngine = new PolicyEngine(policy);
      expect(() => silentEngine.checkPolicy(100, '0xAAA')).not.toThrow();
      expect(() => silentEngine.recordSpend(1.0)).not.toThrow();
    });

    it('calls logger when provided', () => {
      const logs: string[] = [];
      const loggingEngine = new PolicyEngine(policy, (msg) => logs.push(msg));
      loggingEngine.recordSpend(5.0);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]).toContain('$5');
    });
  });
});
