/**
 * Tests for BalanceAggregator — multi-chain balance aggregation.
 */

import { vi } from 'vitest';
import { BalanceAggregator } from '../wallet/balance-aggregator';
import { PaymentAdapter } from '../adapters/types';

function createMockAdapter(overrides: Partial<PaymentAdapter> & { chainName: string; caip2Id: string }): PaymentAdapter {
  return {
    pay: vi.fn().mockResolvedValue('0xhash'),
    getAddress: vi.fn().mockReturnValue('0x1234'),
    chainName: overrides.chainName,
    caip2Id: overrides.caip2Id,
    ...overrides,
  };
}

describe('BalanceAggregator', () => {
  const adapters: PaymentAdapter[] = [
    createMockAdapter({
      chainName: 'Base',
      caip2Id: 'eip155:8453',
      getBalance: vi.fn().mockResolvedValue('150.50'),
    }),
    createMockAdapter({
      chainName: 'Stellar',
      caip2Id: 'stellar:pubnet',
      getBalance: vi.fn().mockResolvedValue('200.00'),
    }),
    createMockAdapter({
      chainName: 'Solana',
      caip2Id: 'solana:mainnet',
      getBalance: vi.fn().mockResolvedValue('50.00'),
    }),
    createMockAdapter({
      chainName: 'Stripe MPP',
      caip2Id: 'fiat:stripe',
      getBalance: vi.fn().mockResolvedValue('300.00'),
    }),
  ];

  let aggregator: BalanceAggregator;

  beforeEach(() => {
    aggregator = new BalanceAggregator(adapters);
  });

  describe('getUnifiedBalance', () => {
    it('should aggregate balances across all chains', async () => {
      const balance = await aggregator.getUnifiedBalance();
      expect(balance.breakdown).toHaveLength(4);
      expect(balance.totalUsd).toBeGreaterThan(0);
      expect(balance.totalFormatted).toMatch(/^\$/);
      expect(balance.timestamp).toBeInstanceOf(Date);
    });

    it('should compute correct totals for stablecoin chains', async () => {
      const balance = await aggregator.getUnifiedBalance();
      // All our mock adapters return USDC/USD amounts (1:1)
      expect(balance.totalUsd).toBeCloseTo(700.50, 1);
    });

    it('should include chain metadata in breakdown', async () => {
      const balance = await aggregator.getUnifiedBalance();
      const base = balance.breakdown.find(b => b.chain === 'Base');
      expect(base).toBeDefined();
      expect(base!.caip2Id).toBe('eip155:8453');
      expect(base!.balance).toBe('150.50');
    });
  });

  describe('getChainBalance', () => {
    it('should return balance for a specific chain', async () => {
      const balance = await aggregator.getChainBalance('eip155:8453');
      expect(balance).not.toBeNull();
      expect(balance!.chain).toBe('Base');
    });

    it('should return null for unknown chain', async () => {
      const balance = await aggregator.getChainBalance('eip155:99999');
      expect(balance).toBeNull();
    });
  });

  describe('getRichestChain', () => {
    it('should find the chain with highest balance', async () => {
      const richest = await aggregator.getRichestChain();
      expect(richest).not.toBeNull();
      expect(richest!.chain).toBe('Stripe MPP');
    });
  });

  describe('hasSufficientFunds', () => {
    it('should return true when funds are sufficient', async () => {
      expect(await aggregator.hasSufficientFunds(100)).toBe(true);
    });

    it('should return false when funds are insufficient', async () => {
      expect(await aggregator.hasSufficientFunds(10000)).toBe(false);
    });
  });

  describe('getChainsWithSufficientFunds', () => {
    it('should return chains that can cover the amount', async () => {
      const chains = await aggregator.getChainsWithSufficientFunds(100);
      expect(chains.length).toBeGreaterThan(0);
      chains.forEach(c => {
        expect(c.balanceUsd).toBeGreaterThanOrEqual(100);
      });
    });
  });

  describe('adapter without getBalance', () => {
    it('should return 0 for adapters without getBalance', async () => {
      const noBalanceAdapter = createMockAdapter({
        chainName: 'NoBalance Chain',
        caip2Id: 'eip155:9999',
      });

      const agg = new BalanceAggregator([noBalanceAdapter]);
      const balance = await agg.getUnifiedBalance();
      expect(balance.totalUsd).toBe(0);
    });
  });

  describe('adapter that throws on getBalance', () => {
    it('should handle errors gracefully', async () => {
      const errorAdapter = createMockAdapter({
        chainName: 'Error Chain',
        caip2Id: 'eip155:1111',
        getBalance: vi.fn().mockRejectedValue(new Error('RPC error')),
      });

      const agg = new BalanceAggregator([errorAdapter]);
      const balance = await agg.getUnifiedBalance();
      expect(balance.totalUsd).toBe(0);
      expect(balance.breakdown[0].balance).toBe('0.00');
    });
  });
});
