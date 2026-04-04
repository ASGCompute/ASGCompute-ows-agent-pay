/**
 * Tests for UnifiedWallet — multi-chain payment facade.
 */

import { vi } from 'vitest';
import { UnifiedWallet } from '../wallet/unified-wallet';
import { PaymentAdapter } from '../adapters/types';

function createMockAdapter(
  chainName: string,
  caip2Id: string,
  balance = '100.00',
  payResult: string | null = '0xhash123'
): PaymentAdapter {
  return {
    pay: vi.fn().mockResolvedValue(payResult),
    getAddress: vi.fn().mockReturnValue('0xAddr_' + chainName),
    chainName,
    caip2Id,
    getBalance: vi.fn().mockResolvedValue(balance),
  };
}

describe('UnifiedWallet', () => {
  const mockAdapters = [
    createMockAdapter('Base', 'eip155:8453', '150.00'),
    createMockAdapter('Stellar', 'stellar:pubnet', '200.00'),
    createMockAdapter('Solana', 'solana:mainnet', '50.00'),
  ];

  let wallet: UnifiedWallet;

  beforeEach(() => {
    wallet = new UnifiedWallet({
      adapters: mockAdapters,
      strategy: 'cheapest',
    });
  });

  describe('constructor', () => {
    it('should require at least one adapter', () => {
      expect(() => new UnifiedWallet({ adapters: [] }))
        .toThrow('at least one adapter');
    });

    it('should default to cheapest strategy', () => {
      expect(wallet.getStrategy()).toBe('cheapest');
    });
  });

  describe('pay()', () => {
    it('should execute payment on best route', async () => {
      const result = await wallet.pay({ amount: '5.00' });
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe('0xhash123');
      expect(result.chain).toBeDefined();
    });

    it('should reject invalid amount', async () => {
      const result = await wallet.pay({ amount: '0' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('positive number');
    });

    it('should reject negative amount', async () => {
      const result = await wallet.pay({ amount: '-5' });
      expect(result.success).toBe(false);
    });

    it('should include fee information', async () => {
      const result = await wallet.pay({ amount: '5.00' });
      expect(result.feeUsd).toBeDefined();
    });

    it('should use override strategy from intent', async () => {
      const result = await wallet.pay({
        amount: '5.00',
        strategy: 'prefer-crypto',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('pay() — fallback on failure', () => {
    it('should try next adapter when primary fails', async () => {
      const failFirst = [
        createMockAdapter('Base', 'eip155:8453', '100.00', null), // fails
        createMockAdapter('Stellar', 'stellar:pubnet', '200.00', '0xstellar_hash'),
      ];

      const w = new UnifiedWallet({ adapters: failFirst, strategy: 'cheapest' });
      const result = await w.pay({ amount: '5.00' });
      // Should fallback to Stellar
      expect(result.success).toBe(true);
    });
  });

  describe('payIntent()', () => {
    it('should parse and execute natural-language intent', async () => {
      const result = await wallet.payIntent('pay $5');
      expect(result.success).toBe(true);
    });
  });

  describe('getBalance()', () => {
    it('should return unified balance', async () => {
      const balance = await wallet.getBalance();
      expect(balance.totalUsd).toBeGreaterThan(0);
      expect(balance.breakdown).toHaveLength(3);
    });
  });

  describe('getTotalBalanceUsd()', () => {
    it('should return numeric total', async () => {
      const total = await wallet.getTotalBalanceUsd();
      expect(total).toBeCloseTo(400, 0);
    });
  });

  describe('canAfford()', () => {
    it('should return true for affordable amounts', async () => {
      expect(await wallet.canAfford(100)).toBe(true);
    });

    it('should return false for unaffordable amounts', async () => {
      expect(await wallet.canAfford(10000)).toBe(false);
    });
  });

  describe('previewRoutes()', () => {
    it('should return all possible routes', () => {
      const routes = wallet.previewRoutes({ amount: '5.00' });
      expect(routes).toHaveLength(3);
    });
  });

  describe('strategy management', () => {
    it('should allow changing strategy', () => {
      wallet.setStrategy('fastest');
      expect(wallet.getStrategy()).toBe('fastest');
    });
  });

  describe('session management', () => {
    it('should create and manage sessions', () => {
      const session = wallet.createSession({
        maxPerTransaction: 10,
        maxTotal: 100,
        expiresAt: new Date(Date.now() + 3600_000),
      });
      expect(session.id).toMatch(/^sess_/);
      expect(session.isActive).toBe(true);
    });

    it('should revoke sessions', () => {
      const session = wallet.createSession({
        maxPerTransaction: 10,
        maxTotal: 100,
        expiresAt: new Date(Date.now() + 3600_000),
      });
      expect(wallet.revokeSession(session.id)).toBe(true);
    });
  });

  describe('adapter access', () => {
    it('should return primary address', () => {
      const addr = wallet.getAddress();
      expect(addr).toContain('0xAddr_Base');
    });

    it('should return all addresses', () => {
      const addresses = wallet.getAddresses();
      expect(addresses).toHaveLength(3);
      expect(addresses[0]).toHaveProperty('chain');
      expect(addresses[0]).toHaveProperty('address');
    });

    it('should return adapter count', () => {
      expect(wallet.getAdapterCount()).toBe(3);
    });

    it('should find adapter by CAIP-2 ID', () => {
      const adapter = wallet.getAdapter('stellar:pubnet');
      expect(adapter).toBeDefined();
      expect(adapter!.chainName).toBe('Stellar');
    });

    it('should return undefined for unknown CAIP-2 ID', () => {
      expect(wallet.getAdapter('unknown:99')).toBeUndefined();
    });

    it('should return default adapter', () => {
      const adapter = wallet.getDefaultAdapter();
      expect(adapter.chainName).toBe('Base');
    });
  });
});
