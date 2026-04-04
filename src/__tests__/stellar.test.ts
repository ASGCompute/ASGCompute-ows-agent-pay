import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @stellar/stellar-sdk
vi.mock('@stellar/stellar-sdk', () => {
  const mockSign = vi.fn();
  const mockBuild = vi.fn(() => ({ sign: mockSign, toXDR: vi.fn(() => 'xdr') }));
  const mockTxBuilder = {
    addOperation: vi.fn().mockReturnThis(),
    setTimeout: vi.fn().mockReturnThis(),
    build: mockBuild,
  };

  const submitMock = vi.fn().mockResolvedValue({
    hash: 'mock_stellar_tx_hash_abc123def456',
  });

  const loadAccountMock = vi.fn().mockResolvedValue({
    accountId: () => 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ567890AB',
    balances: [
      { asset_type: 'native', balance: '100.0000000' },
      {
        asset_type: 'credit_alphanum4',
        asset_code: 'USDC',
        asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        balance: '50.0000000',
      },
    ],
  });

  return {
    Keypair: {
      fromSecret: vi.fn(() => ({
        publicKey: () => 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ567890AB',
        sign: vi.fn(),
      })),
    },
    Asset: Object.assign(
      vi.fn((code: string, issuer: string) => ({ code, issuer })),
      { native: vi.fn(() => ({ code: 'XLM', issuer: undefined })) }
    ),
    Operation: {
      payment: vi.fn((opts: any) => ({ type: 'payment', ...opts })),
      changeTrust: vi.fn((opts: any) => ({ type: 'changeTrust', ...opts })),
    },
    TransactionBuilder: vi.fn(() => mockTxBuilder),
    Networks: {
      PUBLIC: 'Public Global Stellar Network ; September 2015',
      TESTNET: 'Test SDF Network ; September 2015',
    },
    BASE_FEE: '100',
    Horizon: {
      Server: vi.fn(() => ({
        loadAccount: loadAccountMock,
        submitTransaction: submitMock,
      })),
    },
  };
});

import { StellarPaymentAdapter } from '../adapters/stellar';

describe('StellarPaymentAdapter', () => {
  const testSecret = 'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE6EFVLUEHSMCATRBRJOPOEJJ';

  // ─── Constructor ──────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates adapter with default options (testnet, XLM)', () => {
      const adapter = new StellarPaymentAdapter({ secretKey: testSecret });
      expect(adapter.chainName).toBe('Stellar');
      expect(adapter.caip2Id).toBe('stellar:testnet');
    });

    it('creates adapter for mainnet', () => {
      const adapter = new StellarPaymentAdapter({
        secretKey: testSecret,
        network: 'mainnet',
      });
      expect(adapter.caip2Id).toBe('stellar:pubnet');
    });

    it('creates adapter with USDC asset', () => {
      const adapter = new StellarPaymentAdapter({
        secretKey: testSecret,
        asset: 'USDC',
      });
      expect(adapter).toBeDefined();
    });

    it('creates adapter with custom Horizon URL', () => {
      const adapter = new StellarPaymentAdapter({
        secretKey: testSecret,
        horizonUrl: 'https://custom-horizon.example.com',
      });
      expect(adapter).toBeDefined();
    });
  });

  // ─── getAddress ───────────────────────────────────────────────────

  describe('getAddress', () => {
    it('returns the Stellar public key', () => {
      const adapter = new StellarPaymentAdapter({ secretKey: testSecret });
      const address = adapter.getAddress();
      expect(address).toBe('GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ567890AB');
    });
  });

  // ─── CAIP-2 identifiers ──────────────────────────────────────────

  describe('CAIP-2 identifiers', () => {
    it('testnet → stellar:testnet', () => {
      const adapter = new StellarPaymentAdapter({
        secretKey: testSecret,
        network: 'testnet',
      });
      expect(adapter.caip2Id).toBe('stellar:testnet');
    });

    it('mainnet → stellar:pubnet', () => {
      const adapter = new StellarPaymentAdapter({
        secretKey: testSecret,
        network: 'mainnet',
      });
      expect(adapter.caip2Id).toBe('stellar:pubnet');
    });
  });

  // ─── XLM Payments ────────────────────────────────────────────────

  describe('XLM payments', () => {
    let adapter: StellarPaymentAdapter;
    let logs: string[];

    beforeEach(() => {
      logs = [];
      adapter = new StellarPaymentAdapter({
        secretKey: testSecret,
        network: 'testnet',
        asset: 'XLM',
        logger: (msg) => logs.push(msg),
      });
    });

    it('sends XLM successfully', async () => {
      const dest = 'GDESTINATION1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ56';
      const result = await adapter.pay(dest, '10000000', 'testnet');
      expect(result).toBe('mock_stellar_tx_hash_abc123def456');
      expect(logs.some((l) => l.includes('🚀'))).toBe(true);
      expect(logs.some((l) => l.includes('✅'))).toBe(true);
    });

    it('logs correct amount for XLM', async () => {
      const dest = 'GDESTINATION1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ56';
      await adapter.pay(dest, '10000000', 'testnet');
      // 10000000 stroops = 1.0000000 XLM
      expect(logs.some((l) => l.includes('1.0000000'))).toBe(true);
    });
  });

  // ─── USDC Payments ───────────────────────────────────────────────

  describe('USDC payments', () => {
    let adapter: StellarPaymentAdapter;
    let logs: string[];

    beforeEach(() => {
      logs = [];
      adapter = new StellarPaymentAdapter({
        secretKey: testSecret,
        network: 'testnet',
        asset: 'USDC',
        logger: (msg) => logs.push(msg),
      });
    });

    it('sends USDC successfully', async () => {
      const dest = 'GDESTINATION1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ56';
      const result = await adapter.pay(dest, '5000000', 'testnet');
      expect(result).toBe('mock_stellar_tx_hash_abc123def456');
      expect(logs.some((l) => l.includes('USDC'))).toBe(true);
    });
  });

  // ─── Trustline Management ────────────────────────────────────────

  describe('trustline management', () => {
    it('needsTrustline returns false for XLM', async () => {
      const adapter = new StellarPaymentAdapter({
        secretKey: testSecret,
        asset: 'XLM',
      });
      const needs = await adapter.needsTrustline();
      expect(needs).toBe(false);
    });

    it('needsTrustline returns false when USDC trustline exists', async () => {
      const adapter = new StellarPaymentAdapter({
        secretKey: testSecret,
        asset: 'USDC',
      });
      // Mock has USDC in balances
      const needs = await adapter.needsTrustline();
      expect(needs).toBe(false);
    });

    it('createUsdcTrustline returns hash', async () => {
      const logs: string[] = [];
      const adapter = new StellarPaymentAdapter({
        secretKey: testSecret,
        asset: 'USDC',
        logger: (msg) => logs.push(msg),
      });
      const hash = await adapter.createUsdcTrustline();
      expect(hash).toBe('mock_stellar_tx_hash_abc123def456');
      expect(logs.some((l) => l.includes('Trustline created'))).toBe(true);
    });
  });

  // ─── Logger ──────────────────────────────────────────────────────

  describe('logger', () => {
    it('is silent by default', () => {
      const adapter = new StellarPaymentAdapter({ secretKey: testSecret });
      expect(adapter).toBeDefined();
    });

    it('accepts custom logger', async () => {
      const logs: string[] = [];
      const adapter = new StellarPaymentAdapter({
        secretKey: testSecret,
        logger: (msg) => logs.push(msg),
      });
      await adapter.pay('GDEST123', '1000000', 'testnet');
      expect(logs.length).toBeGreaterThan(0);
    });
  });
});
