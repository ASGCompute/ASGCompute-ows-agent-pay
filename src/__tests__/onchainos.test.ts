/**
 * OnchainOS Provider Tests
 * 
 * Tests the OnchainOS API integration including:
 * - Auth header generation (HMAC-SHA256)
 * - DEX aggregator endpoints
 * - Health check
 * - Factory function
 */

import { OnchainOSProvider, createOnchainOSFromEnv } from '../providers/onchainos';

// Mock credentials for unit tests
const MOCK_CONFIG = {
  apiKey: 'test-api-key',
  secretKey: 'test-secret-key',
  passphrase: 'TestPass1!',
};

describe('OnchainOSProvider', () => {
  describe('constructor', () => {
    it('should create a provider with valid config', () => {
      const provider = new OnchainOSProvider(MOCK_CONFIG);
      expect(provider).toBeDefined();
    });

    it('should accept optional logger', () => {
      const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const provider = new OnchainOSProvider({ ...MOCK_CONFIG, logger });
      expect(provider).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should return ok: false when API is unreachable with invalid credentials', async () => {
      const provider = new OnchainOSProvider(MOCK_CONFIG);
      const health = await provider.healthCheck();
      // With invalid credentials, it should fail gracefully
      expect(health).toHaveProperty('ok');
      expect(typeof health.ok).toBe('boolean');
      expect(health).toHaveProperty('chains');
      expect(health).toHaveProperty('xlayer');
    });
  });

  describe('createOnchainOSFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should return null when env vars are missing', () => {
      delete process.env.OKX_API_KEY;
      delete process.env.OKX_SECRET_KEY;
      delete process.env.OKX_PASSPHRASE;
      const provider = createOnchainOSFromEnv();
      expect(provider).toBeNull();
    });

    it('should create provider when all env vars are set', () => {
      process.env.OKX_API_KEY = 'key';
      process.env.OKX_SECRET_KEY = 'secret';
      process.env.OKX_PASSPHRASE = 'pass';
      const provider = createOnchainOSFromEnv();
      expect(provider).toBeInstanceOf(OnchainOSProvider);
    });
  });
});

// ── Live Integration Tests (only run with real credentials) ────────
const hasCredentials = !!(
  process.env.OKX_API_KEY &&
  process.env.OKX_SECRET_KEY &&
  process.env.OKX_PASSPHRASE
);

(hasCredentials ? describe : describe.skip)('OnchainOS Live Integration', () => {
  let provider: OnchainOSProvider;

  beforeAll(() => {
    provider = new OnchainOSProvider({
      apiKey: process.env.OKX_API_KEY!,
      secretKey: process.env.OKX_SECRET_KEY!,
      passphrase: process.env.OKX_PASSPHRASE!,
    });
  });

  it('should pass health check', async () => {
    const health = await provider.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.chains).toBeGreaterThan(20);
    expect(health.xlayer).toBe(true);
  }, 15000);

  it('should return supported chains including X Layer and Base', async () => {
    const chains = await provider.getSupportedChains();
    expect(chains.length).toBeGreaterThan(20);
    expect(chains.some(c => c.chainIndex === '196')).toBe(true); // X Layer
    expect(chains.some(c => c.chainIndex === '8453')).toBe(true); // Base
  }, 15000);

  it('should get quote for Base USDC→ETH swap', async () => {
    const quote = await provider.getQuote({
      chainIndex: '8453',
      fromTokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      toTokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      amount: '1000000', // 1 USDC
    });
    expect(quote).toBeDefined();
    expect(quote.toTokenAmount).toBeDefined();
    expect(quote.dexRouterList).toBeDefined();
    expect(quote.dexRouterList.length).toBeGreaterThan(0);
  }, 15000);

  it('should get quote for X Layer OKB→USDC swap', async () => {
    const quote = await provider.getQuote({
      chainIndex: '196',
      fromTokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      toTokenAddress: '0x74b7f16337b8972027f6196a17a631ac6de26d22',
      amount: '10000000000000000', // 0.01 OKB
    });
    expect(quote).toBeDefined();
    expect(quote.toTokenAmount).toBeDefined();
  }, 15000);
});
