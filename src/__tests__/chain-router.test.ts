/**
 * Tests for ChainRouter — optimal chain selection.
 */

import { vi } from 'vitest';
import { ChainRouter } from '../wallet/chain-router';
import { PaymentAdapter } from '../adapters/types';
import { PayIntent } from '../wallet/types';

function createMockAdapter(chainName: string, caip2Id: string): PaymentAdapter {
  return {
    pay: vi.fn().mockResolvedValue('0xhash'),
    getAddress: vi.fn().mockReturnValue('0x1234'),
    chainName,
    caip2Id,
  };
}

describe('ChainRouter', () => {
  const adapters: PaymentAdapter[] = [
    createMockAdapter('Base', 'eip155:8453'),
    createMockAdapter('Stellar', 'stellar:pubnet'),
    createMockAdapter('Solana', 'solana:mainnet'),
    createMockAdapter('Stripe MPP', 'fiat:stripe'),
    createMockAdapter('Ethereum', 'eip155:1'),
  ];

  let router: ChainRouter;

  beforeEach(() => {
    router = new ChainRouter(adapters);
  });

  describe('route()', () => {
    const intent: PayIntent = { amount: '5.00' };

    it('should return plans for all adapters', () => {
      const plans = router.route(intent, 'cheapest');
      expect(plans).toHaveLength(5);
    });

    it('should sort by score (lower = better)', () => {
      const plans = router.route(intent, 'cheapest');
      for (let i = 1; i < plans.length; i++) {
        expect(plans[i].score).toBeGreaterThanOrEqual(plans[i - 1].score);
      }
    });

    it('should include correct metadata in plans', () => {
      const plans = router.route(intent, 'cheapest');
      const basePlan = plans.find(p => p.chain === 'Base');
      expect(basePlan).toBeDefined();
      expect(basePlan!.caip2Id).toBe('eip155:8453');
      expect(basePlan!.atomicAmount).toBe('5000000'); // 5 USDC * 10^6
      expect(basePlan!.estimatedFeeUsd).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array for invalid amount', () => {
      const plans = router.route({ amount: '-1' }, 'cheapest');
      expect(plans).toHaveLength(0);
    });

    it('should return empty array for zero amount', () => {
      const plans = router.route({ amount: '0' }, 'cheapest');
      expect(plans).toHaveLength(0);
    });
  });

  describe('cheapest strategy', () => {
    it('should prefer low-fee chains', () => {
      const plans = router.route({ amount: '5.00' }, 'cheapest');
      // Stellar has lowest fee ($0.00001)
      expect(plans[0].chain).toBe('Stellar');
    });

    it('should penalise Ethereum due to high gas', () => {
      const plans = router.route({ amount: '5.00' }, 'cheapest');
      const ethIndex = plans.findIndex(p => p.chain === 'Ethereum');
      expect(ethIndex).toBe(plans.length - 1); // Should be last
    });
  });

  describe('fastest strategy', () => {
    it('should prefer fast-settlement chains', () => {
      const plans = router.route({ amount: '5.00' }, 'fastest');
      // Solana has 1s settlement
      expect(plans[0].chain).toBe('Solana');
    });
  });

  describe('prefer-crypto strategy', () => {
    it('should penalise fiat rails', () => {
      const plans = router.route({ amount: '5.00' }, 'prefer-crypto');
      const stripeIndex = plans.findIndex(p => p.chain === 'Stripe MPP');
      expect(stripeIndex).toBeGreaterThan(0);
    });
  });

  describe('prefer-fiat strategy', () => {
    it('should prefer fiat rails', () => {
      const plans = router.route({ amount: '5.00' }, 'prefer-fiat');
      expect(plans[0].chain).toBe('Stripe MPP');
    });
  });

  describe('maxFeeUsd filter', () => {
    it('should filter out plans exceeding max fee', () => {
      const plans = router.route(
        { amount: '5.00', maxFeeUsd: 0.001 },
        'cheapest'
      );
      plans.forEach(p => {
        expect(p.estimatedFeeUsd).toBeLessThanOrEqual(0.001);
      });
      // Stripe ($0.30) and Ethereum ($2.50) should be excluded
      expect(plans.find(p => p.chain === 'Stripe MPP')).toBeUndefined();
      expect(plans.find(p => p.chain === 'Ethereum')).toBeUndefined();
    });
  });

  describe('getBestPlan()', () => {
    it('should return the single best plan', () => {
      const plan = router.getBestPlan({ amount: '5.00' }, 'cheapest');
      expect(plan).not.toBeNull();
      expect(plan!.chain).toBe('Stellar');
    });

    it('should return null for invalid intent', () => {
      const plan = router.getBestPlan({ amount: '0' }, 'cheapest');
      expect(plan).toBeNull();
    });
  });

  describe('getChainMeta()', () => {
    it('should return metadata for known chains', () => {
      const meta = router.getChainMeta('eip155:8453');
      expect(meta.name).toBe('Base');
      expect(meta.avgFeeUsd).toBeLessThan(0.01);
    });

    it('should return defaults for unknown chains', () => {
      const meta = router.getChainMeta('unknown:99');
      expect(meta.name).toBe('Unknown');
      expect(meta.priorityBoost).toBe(10);
    });
  });

  describe('atomic unit conversion', () => {
    it('should convert correctly for EVM (6 decimals)', () => {
      const plans = router.route({ amount: '1.00' }, 'cheapest');
      const base = plans.find(p => p.caip2Id === 'eip155:8453');
      expect(base!.atomicAmount).toBe('1000000');
    });

    it('should convert correctly for Stellar (7 decimals)', () => {
      const plans = router.route({ amount: '1.00' }, 'cheapest');
      const stellar = plans.find(p => p.caip2Id === 'stellar:pubnet');
      expect(stellar!.atomicAmount).toBe('10000000');
    });

    it('should convert correctly for Stripe (2 decimals)', () => {
      const plans = router.route({ amount: '1.00' }, 'cheapest');
      const stripe = plans.find(p => p.caip2Id === 'fiat:stripe');
      expect(stripe!.atomicAmount).toBe('100');
    });
  });
});
