import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BasePaymentAdapter } from '../adapters/base';

// Mock viem
vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createWalletClient: vi.fn(() => ({
      sendTransaction: vi.fn().mockResolvedValue('0xmock_eth_tx_hash_123'),
      writeContract: vi.fn().mockResolvedValue('0xmock_usdc_tx_hash_456'),
    })),
    createPublicClient: vi.fn(() => ({
      getBalance: vi.fn().mockResolvedValue(BigInt('5000000000000000000')), // 5 ETH
      readContract: vi.fn().mockResolvedValue(BigInt('10000000')), // 10 USDC
    })),
  };
});

vi.mock('viem/accounts', async () => {
  const actual = await vi.importActual<typeof import('viem/accounts')>('viem/accounts');
  return {
    ...actual,
  };
});

describe('BasePaymentAdapter', () => {
  // ─── Constructor ──────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates adapter with default options (testnet, ETH)', () => {
      const adapter = new BasePaymentAdapter();
      expect(adapter.chainName).toBe('Base');
      expect(adapter.caip2Id).toBe('eip155:84532');
    });

    it('creates adapter for mainnet', () => {
      const adapter = new BasePaymentAdapter({ network: 'mainnet' });
      expect(adapter.caip2Id).toBe('eip155:8453');
    });

    it('creates adapter with ETH asset', () => {
      const adapter = new BasePaymentAdapter({ asset: 'ETH' });
      expect(adapter).toBeDefined();
    });

    it('creates adapter with USDC asset', () => {
      const adapter = new BasePaymentAdapter({ asset: 'USDC' });
      expect(adapter).toBeDefined();
    });

    it('generates random key if not provided', () => {
      const a1 = new BasePaymentAdapter();
      const a2 = new BasePaymentAdapter();
      expect(a1.getAddress()).not.toBe(a2.getAddress());
    });

    it('uses provided key deterministically', () => {
      const key = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;
      const a1 = new BasePaymentAdapter({ privateKey: key });
      const a2 = new BasePaymentAdapter({ privateKey: key, network: 'mainnet' });
      expect(a1.getAddress()).toBe(a2.getAddress());
    });
  });

  // ─── getAddress ───────────────────────────────────────────────────

  describe('getAddress', () => {
    it('returns valid 0x-prefixed address', () => {
      const adapter = new BasePaymentAdapter();
      expect(adapter.getAddress()).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  // ─── CAIP-2 ───────────────────────────────────────────────────────

  describe('CAIP-2 identifiers', () => {
    it('testnet → eip155:84532', () => {
      const adapter = new BasePaymentAdapter({ network: 'testnet' });
      expect(adapter.caip2Id).toBe('eip155:84532');
    });

    it('mainnet → eip155:8453', () => {
      const adapter = new BasePaymentAdapter({ network: 'mainnet' });
      expect(adapter.caip2Id).toBe('eip155:8453');
    });
  });

  // ─── ETH Payments ────────────────────────────────────────────────

  describe('ETH payments', () => {
    let adapter: BasePaymentAdapter;
    let logs: string[];

    beforeEach(() => {
      logs = [];
      adapter = new BasePaymentAdapter({
        asset: 'ETH',
        logger: (msg) => logs.push(msg),
      });
    });

    it('sends ETH successfully', async () => {
      const dest = '0x1234567890AbcdEF1234567890aBcdef12345678';
      const result = await adapter.pay(dest, '1000000000000000000', 'testnet');
      expect(result).toBe('0xmock_eth_tx_hash_123');
      expect(logs.some((l) => l.includes('🚀'))).toBe(true);
    });

    it('returns null on insufficient ETH balance', async () => {
      const dest = '0x1234567890AbcdEF1234567890aBcdef12345678';
      // Request 100 ETH (balance is 5 ETH)
      const result = await adapter.pay(dest, '100000000000000000000', 'testnet');
      expect(result).toBeNull();
      expect(logs.some((l) => l.includes('Insufficient'))).toBe(true);
    });
  });

  // ─── USDC Payments ───────────────────────────────────────────────

  describe('USDC payments', () => {
    let adapter: BasePaymentAdapter;
    let logs: string[];

    beforeEach(() => {
      logs = [];
      adapter = new BasePaymentAdapter({
        asset: 'USDC',
        logger: (msg) => logs.push(msg),
      });
    });

    it('sends USDC successfully', async () => {
      const dest = '0x1234567890AbcdEF1234567890aBcdef12345678';
      const result = await adapter.pay(dest, '5000000', 'testnet');
      expect(result).toBe('0xmock_usdc_tx_hash_456');
      expect(logs.some((l) => l.includes('USDC'))).toBe(true);
    });

    it('returns null on insufficient USDC balance', async () => {
      const dest = '0x1234567890AbcdEF1234567890aBcdef12345678';
      // Request 100 USDC (balance is 10 USDC = 10_000_000 atomic)
      const result = await adapter.pay(dest, '100000000', 'testnet');
      expect(result).toBeNull();
      expect(logs.some((l) => l.includes('Insufficient'))).toBe(true);
    });
  });

  // ─── Balance ─────────────────────────────────────────────────────

  describe('balance checks', () => {
    it('returns ETH balance', async () => {
      const adapter = new BasePaymentAdapter();
      const balance = await adapter.getBalance();
      expect(balance).toBe('5'); // 5 ETH
    });

    it('returns USDC balance', async () => {
      const adapter = new BasePaymentAdapter({ asset: 'USDC' });
      const balance = await adapter.getUsdcBalance();
      expect(balance).toBe('10'); // 10 USDC (10_000_000 / 1e6)
    });
  });

  // ─── Logger ──────────────────────────────────────────────────────

  describe('logger', () => {
    it('is silent by default', () => {
      const adapter = new BasePaymentAdapter();
      expect(adapter).toBeDefined();
    });

    it('accepts custom logger', () => {
      const logs: string[] = [];
      const adapter = new BasePaymentAdapter({
        logger: (msg) => logs.push(msg),
      });
      expect(adapter).toBeDefined();
    });
  });
});
