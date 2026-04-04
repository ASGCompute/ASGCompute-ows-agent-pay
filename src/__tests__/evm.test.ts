import { describe, it, expect } from 'vitest';
import { EvmPaymentAdapter, listEvmChains } from '../adapters/evm';
import type { EvmChainName } from '../adapters/evm';

describe('EvmPaymentAdapter', () => {
  // ── Chain registry ──────────────────────────────────────────────

  describe('chain registry', () => {
    const allChains: EvmChainName[] = [
      'base', 'base-sepolia',
      'arbitrum', 'arbitrum-sepolia',
      'optimism', 'optimism-sepolia',
      'ethereum', 'ethereum-sepolia',
      'polygon', 'polygon-amoy',
    ];

    it.each(allChains)('creates adapter for chain: %s', (chainName) => {
      const adapter = new EvmPaymentAdapter({
        chain: chainName,
        asset: 'native',
      });

      expect(adapter.chainName).toBeTruthy();
      expect(adapter.caip2Id).toMatch(/^eip155:\d+$/);
      expect(adapter.getAddress()).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('rejects unsupported chain name', () => {
      expect(() => {
        new EvmPaymentAdapter({
          chain: 'avalanche' as any,
          asset: 'native',
        });
      }).toThrow(/Unsupported chain/);
    });
  });

  // ── CAIP-2 IDs ──────────────────────────────────────────────────

  describe('CAIP-2 identifiers', () => {
    const chainIdMap: [EvmChainName, number][] = [
      ['base', 8453],
      ['base-sepolia', 84532],
      ['arbitrum', 42161],
      ['arbitrum-sepolia', 421614],
      ['optimism', 10],
      ['optimism-sepolia', 11155420],
      ['ethereum', 1],
      ['ethereum-sepolia', 11155111],
      ['polygon', 137],
      ['polygon-amoy', 80002],
    ];

    it.each(chainIdMap)(
      '%s → eip155:%d',
      (chainName, expectedChainId) => {
        const adapter = new EvmPaymentAdapter({ chain: chainName });
        expect(adapter.caip2Id).toBe(`eip155:${expectedChainId}`);
      }
    );
  });

  // ── USDC validation ─────────────────────────────────────────────

  describe('USDC support', () => {
    const chainsWithUsdc: EvmChainName[] = [
      'base', 'base-sepolia',
      'arbitrum', 'arbitrum-sepolia',
      'optimism', 'optimism-sepolia',
      'ethereum', 'ethereum-sepolia',
      'polygon',
    ];

    it.each(chainsWithUsdc)(
      '%s supports USDC',
      (chainName) => {
        expect(() => {
          new EvmPaymentAdapter({
            chain: chainName,
            asset: 'USDC',
          });
        }).not.toThrow();
      }
    );

    it('polygon-amoy rejects USDC (no contract)', () => {
      expect(() => {
        new EvmPaymentAdapter({
          chain: 'polygon-amoy',
          asset: 'USDC',
        });
      }).toThrow(/No USDC contract/);
    });
  });

  // ── Private key ─────────────────────────────────────────────────

  describe('private key handling', () => {
    it('generates random key if not provided', () => {
      const a1 = new EvmPaymentAdapter({ chain: 'base' });
      const a2 = new EvmPaymentAdapter({ chain: 'base' });
      expect(a1.getAddress()).not.toBe(a2.getAddress());
    });

    it('uses provided key deterministically', () => {
      const key = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
      const a1 = new EvmPaymentAdapter({ chain: 'base', privateKey: key });
      const a2 = new EvmPaymentAdapter({ chain: 'arbitrum', privateKey: key });
      expect(a1.getAddress()).toBe(a2.getAddress()); // Same key → same address
    });
  });

  // ── Display names ───────────────────────────────────────────────

  describe('display names', () => {
    it('base → Base', () => {
      expect(new EvmPaymentAdapter({ chain: 'base' }).chainName).toBe('Base');
    });

    it('arbitrum → Arbitrum One', () => {
      expect(new EvmPaymentAdapter({ chain: 'arbitrum' }).chainName).toBe('Arbitrum One');
    });

    it('optimism → Optimism', () => {
      expect(new EvmPaymentAdapter({ chain: 'optimism' }).chainName).toBe('Optimism');
    });

    it('ethereum → Ethereum', () => {
      expect(new EvmPaymentAdapter({ chain: 'ethereum' }).chainName).toBe('Ethereum');
    });

    it('polygon → Polygon', () => {
      expect(new EvmPaymentAdapter({ chain: 'polygon' }).chainName).toBe('Polygon');
    });
  });

  // ── Logger ──────────────────────────────────────────────────────

  describe('logger', () => {
    it('is silent by default', () => {
      const adapter = new EvmPaymentAdapter({
        chain: 'base',
        asset: 'native',
      });
      // Constructor doesn't throw — no stdout
      expect(adapter).toBeDefined();
    });

    it('accepts custom logger', () => {
      const logs: string[] = [];
      const adapter = new EvmPaymentAdapter({
        chain: 'arbitrum',
        asset: 'USDC',
        logger: (msg) => logs.push(msg),
      });
      expect(adapter).toBeDefined();
    });
  });

  // ── listEvmChains() helper ──────────────────────────────────────

  describe('listEvmChains()', () => {
    it('returns all 10 chains', () => {
      const chains = listEvmChains();
      expect(chains.length).toBe(10);
    });

    it('each entry has required fields', () => {
      const chains = listEvmChains();
      for (const c of chains) {
        expect(c.name).toBeTruthy();
        expect(c.displayName).toBeTruthy();
        expect(c.chainId).toBeTypeOf('number');
        expect(c.caip2Id).toMatch(/^eip155:\d+$/);
        expect(c.hasUsdc).toBeTypeOf('boolean');
      }
    });

    it('base mainnet has USDC', () => {
      const base = listEvmChains().find((c) => c.name === 'base')!;
      expect(base.hasUsdc).toBe(true);
      expect(base.chainId).toBe(8453);
    });

    it('polygon-amoy has no USDC', () => {
      const amoy = listEvmChains().find((c) => c.name === 'polygon-amoy')!;
      expect(amoy.hasUsdc).toBe(false);
    });
  });
});
