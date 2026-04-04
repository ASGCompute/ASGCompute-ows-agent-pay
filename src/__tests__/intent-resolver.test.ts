/**
 * Tests for IntentResolver — natural-language payment parsing.
 */

import { IntentResolver } from '../wallet/intent-resolver';

describe('IntentResolver', () => {
  let resolver: IntentResolver;

  beforeEach(() => {
    resolver = new IntentResolver();
  });

  describe('resolve() — USD amounts', () => {
    it('should parse "$5"', () => {
      const intent = resolver.resolve('pay $5');
      expect(intent.amount).toBe('5');
      expect(intent.asset).toBe('USDC');
    });

    it('should parse "$5.00"', () => {
      const intent = resolver.resolve('send $5.00 to someone');
      expect(intent.amount).toBe('5.00');
    });

    it('should parse "$0.50"', () => {
      const intent = resolver.resolve('$0.50');
      expect(intent.amount).toBe('0.50');
    });

    it('should parse "$100.99"', () => {
      const intent = resolver.resolve('pay $100.99 for API access');
      expect(intent.amount).toBe('100.99');
    });
  });

  describe('resolve() — asset amounts', () => {
    it('should parse "10 USDC"', () => {
      const intent = resolver.resolve('send 10 USDC');
      expect(intent.amount).toBe('10.00');
      expect(intent.asset).toBe('USDC');
    });

    it('should parse "0.5 ETH" with USD conversion', () => {
      const intent = resolver.resolve('pay 0.5 ETH');
      expect(parseFloat(intent.amount)).toBeGreaterThan(1000);
      expect(intent.asset).toBe('ETH');
    });

    it('should parse "100 XLM"', () => {
      const intent = resolver.resolve('send 100 XLM');
      expect(parseFloat(intent.amount)).toBeCloseTo(12, 0);
      expect(intent.asset).toBe('XLM');
    });

    it('should be case-insensitive', () => {
      const intent = resolver.resolve('send 5 usdc');
      expect(intent.asset).toBe('USDC');
    });
  });

  describe('resolve() — destinations', () => {
    it('should extract Ethereum address', () => {
      const intent = resolver.resolve('pay $5 to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68');
      expect(intent.destination).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68');
    });

    it('should extract Stellar address', () => {
      const intent = resolver.resolve('send $10 to GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG');
      expect(intent.destination).toBe('GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG');
    });
  });

  describe('resolve() — memos', () => {
    it('should extract "memo: invoice-123"', () => {
      const intent = resolver.resolve('pay $5 memo: invoice-123');
      expect(intent.memo).toBe('invoice-123');
    });

    it('should extract "memo:ref42"', () => {
      const intent = resolver.resolve('send 10 USDC memo:ref42');
      expect(intent.memo).toBe('ref42');
    });
  });

  describe('validate()', () => {
    it('should pass for valid intent', () => {
      const result = resolver.validate({ amount: '5.00' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for zero amount', () => {
      const result = resolver.validate({ amount: '0' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Amount must be a positive number');
    });

    it('should fail for negative amount', () => {
      const result = resolver.validate({ amount: '-5' });
      expect(result.valid).toBe(false);
    });

    it('should fail for amount exceeding max', () => {
      const result = resolver.validate({ amount: '2000000' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Amount exceeds maximum ($1,000,000)');
    });

    it('should fail for non-numeric amount', () => {
      const result = resolver.validate({ amount: 'abc' });
      expect(result.valid).toBe(false);
    });
  });

  describe('usdToAsset()', () => {
    it('should convert USD to USDC 1:1', () => {
      expect(resolver.usdToAsset('5.00', 'USDC')).toBe('5.000000');
    });

    it('should convert USD to ETH', () => {
      const ethAmount = parseFloat(resolver.usdToAsset('3200', 'ETH'));
      expect(ethAmount).toBeCloseTo(1.0, 1);
    });

    it('should convert USD to XLM', () => {
      const xlmAmount = parseFloat(resolver.usdToAsset('1.20', 'XLM'));
      expect(xlmAmount).toBeCloseTo(10.0, 0);
    });
  });
});
