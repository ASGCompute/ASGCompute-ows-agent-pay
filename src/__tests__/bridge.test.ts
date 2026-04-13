/**
 * Cross-Chain Bridge Tests
 */

import { CrossChainBridge } from '../providers/bridge';
import { OnchainOSProvider } from '../providers/onchainos';

// Mock OnchainOS provider
const mockProvider = {
  getQuote: jest.fn(),
  getSwapData: jest.fn(),
  getSupportedChains: jest.fn(),
  request: jest.fn(),
} as unknown as OnchainOSProvider;

describe('CrossChainBridge', () => {
  let bridge: CrossChainBridge;

  beforeEach(() => {
    bridge = new CrossChainBridge({ provider: mockProvider });
    jest.clearAllMocks();
  });

  describe('getSupportedChains', () => {
    it('should return all supported chains', () => {
      const chains = bridge.getSupportedChains();
      expect(chains.length).toBeGreaterThanOrEqual(9);

      const names = chains.map(c => c.name);
      expect(names).toContain('Base');
      expect(names).toContain('X Layer');
      expect(names).toContain('Ethereum');
      expect(names).toContain('Arbitrum');
      expect(names).toContain('Optimism');
      expect(names).toContain('Polygon');
    });

    it('should mark chains with USDC', () => {
      const chains = bridge.getSupportedChains();
      const base = chains.find(c => c.chainIndex === '8453');
      expect(base?.hasUsdc).toBe(true);

      const xlayer = chains.find(c => c.chainIndex === '196');
      expect(xlayer?.hasUsdc).toBe(true);
    });
  });

  describe('getUsdcAddress', () => {
    it('should return USDC address for Base', () => {
      expect(bridge.getUsdcAddress('8453')).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    });

    it('should return USDC address for X Layer', () => {
      expect(bridge.getUsdcAddress('196')).toBe('0x74b7f16337b8972027f6196a17a631ac6de26d22');
    });

    it('should return null for unsupported chain', () => {
      expect(bridge.getUsdcAddress('99999')).toBeNull();
    });
  });

  describe('isRouteSupported', () => {
    it('should support Base → X Layer', () => {
      expect(bridge.isRouteSupported('8453', '196')).toBe(true);
    });

    it('should support Ethereum → Arbitrum', () => {
      expect(bridge.isRouteSupported('1', '42161')).toBe(true);
    });

    it('should NOT support same chain', () => {
      expect(bridge.isRouteSupported('8453', '8453')).toBe(false);
    });

    it('should NOT support unknown chain', () => {
      expect(bridge.isRouteSupported('8453', '99999')).toBe(false);
    });
  });

  describe('getEstimatedTime', () => {
    it('should return 3 min for L2 → L2', () => {
      expect(bridge.getEstimatedTime('8453', '196')).toBe(180);
    });

    it('should return 10 min for L1 involved', () => {
      expect(bridge.getEstimatedTime('1', '8453')).toBe(600);
    });

    it('should return 5 min default', () => {
      expect(bridge.getEstimatedTime('137', '56')).toBe(300);
    });
  });

  describe('getQuote (two-step)', () => {
    it('should get USDC → USDC bridge quote', async () => {
      // Mock: cross-chain API unavailable, falls back to two-step
      (mockProvider as any).request = jest.fn().mockRejectedValue(new Error('50050'));

      const result = await bridge.getQuote({
        fromChainIndex: '8453',
        toChainIndex: '196',
        fromTokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        toTokenAddress: '0x74b7f16337b8972027f6196a17a631ac6de26d22',
        amount: '1000000', // 1 USDC
      });

      expect(result).toBeDefined();
      expect(result.route).toBeDefined();
      expect(result.route.steps.length).toBeGreaterThanOrEqual(1);
      expect(result.toTokenAmount).toBeDefined();
      expect(Number(result.toTokenAmount)).toBeGreaterThan(0);
      expect(result.estimatedTimeSeconds).toBeGreaterThan(0);
    });

    it('should get native → native bridge quote with swaps', async () => {
      (mockProvider as any).request = jest.fn().mockRejectedValue(new Error('50050'));

      // Mock DEX quote for ETH → USDC on Base
      (mockProvider.getQuote as jest.Mock)
        .mockResolvedValueOnce({
          toTokenAmount: '2260000', // ~$2.26 for ~0.001 ETH
          dexRouterList: [{ dexProtocol: { dexName: 'Aerodrome CL' } }],
        })
        .mockResolvedValueOnce({
          toTokenAmount: '27000000000000000', // ~0.027 OKB
          dexRouterList: [{ dexProtocol: { dexName: 'QuickSwap V3' } }],
        });

      const result = await bridge.getQuote({
        fromChainIndex: '8453',
        toChainIndex: '196',
        fromTokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
        toTokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // OKB
        amount: '1000000000000000', // 0.001 ETH
      });

      expect(result.route.steps.length).toBe(3); // swap + bridge + swap
      expect(result.route.steps[0].type).toBe('swap'); // ETH → USDC
      expect(result.route.steps[1].type).toBe('bridge'); // USDC cross-chain
      expect(result.route.steps[2].type).toBe('swap'); // USDC → OKB
      expect(result.route.description).toContain('Base');
      expect(result.route.description).toContain('X Layer');
    });

    it('should reject unsupported routes', async () => {
      await expect(
        bridge.getQuote({
          fromChainIndex: '8453',
          toChainIndex: '99999',
          fromTokenAddress: '0x...',
          toTokenAddress: '0x...',
          amount: '1000000',
        }),
      ).rejects.toThrow('Unsupported bridge route');
    });
  });

  describe('bridgeUsdc', () => {
    it('should bridge USDC from Base to X Layer', async () => {
      (mockProvider as any).request = jest.fn().mockRejectedValue(new Error('50050'));

      const result = await bridge.bridgeUsdc('8453', '196', '1000000');
      expect(result).toBeDefined();
      expect(result.fromToken.address).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
      expect(result.toToken.address).toBe('0x74b7f16337b8972027f6196a17a631ac6de26d22');
    });

    it('should reject if chain has no USDC', async () => {
      await expect(bridge.bridgeUsdc('8453', '501', '1000000')).rejects.toThrow('USDC not supported');
    });
  });

  describe('bridgeNative', () => {
    it('should bridge native ETH(Base) → OKB(X Layer)', async () => {
      (mockProvider as any).request = jest.fn().mockRejectedValue(new Error('50050'));
      (mockProvider.getQuote as jest.Mock)
        .mockResolvedValueOnce({ toTokenAmount: '500000', dexRouterList: [{ dexProtocol: { dexName: 'Aero' } }] })
        .mockResolvedValueOnce({ toTokenAmount: '10000000000000', dexRouterList: [{ dexProtocol: { dexName: 'QS' } }] });

      const result = await bridge.bridgeNative('8453', '196', '100000000000000');
      expect(result).toBeDefined();
      expect(result.route.steps.length).toBeGreaterThanOrEqual(1);
    });
  });
});
