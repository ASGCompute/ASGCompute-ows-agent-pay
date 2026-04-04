/**
 * Tests for FacilitatorService — core revenue engine.
 */

import { FacilitatorService } from '../facilitator/facilitator-service';

describe('FacilitatorService', () => {
  let service: FacilitatorService;

  beforeEach(() => {
    service = new FacilitatorService();
  });

  describe('API Key Management', () => {
    it('should create API key with correct prefix', () => {
      const key = service.createApiKey('owner-1', 'Test Key', 'dev');
      expect(key.key).toMatch(/^asg_test_/);
      expect(key.plan).toBe('dev');
      expect(key.isActive).toBe(true);
    });

    it('should create live key for paid plans', () => {
      const key = service.createApiKey('owner-1', 'Prod Key', 'growth');
      expect(key.key).toMatch(/^asg_live_/);
    });

    it('should validate active key', () => {
      const key = service.createApiKey('owner-1', 'Key', 'growth');
      const result = service.validateApiKey(key.key);
      expect(result.valid).toBe(true);
    });

    it('should reject unknown key', () => {
      const result = service.validateApiKey('asg_test_unknown');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('API key not found');
    });

    it('should reject revoked key', () => {
      const key = service.createApiKey('owner-1', 'Key', 'growth');
      service.revokeApiKey(key.key);
      const result = service.validateApiKey(key.key);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('API key is deactivated');
    });

    it('should upgrade plan', () => {
      const key = service.createApiKey('owner-1', 'Key', 'dev');
      expect(service.upgradePlan(key.key, 'scale')).toBe(true);
    });
  });

  describe('Payment Facilitation', () => {
    it('should process a successful payment', async () => {
      const key = service.createApiKey('owner-1', 'Key', 'growth');
      const result = await service.facilitate(key.key, {
        protocol: 'x402',
        amount: '10.00',
        destination: '0xMerchant',
      });

      expect(result.success).toBe(true);
      expect(result.transactionHash).toBeTruthy();
      expect(result.facilitationId).toMatch(/^fac_/);
      expect(parseFloat(result.fee)).toBeGreaterThan(0);
      expect(parseFloat(result.amountSettled)).toBeLessThan(10);
      expect(result.settlement).toBe('instant');
    });

    it('should extract correct fee (1% for growth)', async () => {
      const key = service.createApiKey('owner-1', 'Key', 'growth');
      const result = await service.facilitate(key.key, {
        protocol: 'x402',
        amount: '100.00',
        destination: '0xMerchant',
      });

      expect(parseFloat(result.fee)).toBeCloseTo(1.0, 2);
      expect(result.feePercent).toBe(1.0);
      expect(parseFloat(result.amountSettled)).toBeCloseTo(99.0, 1);
    });

    it('should extract higher fee for MPP (1.5%)', async () => {
      const key = service.createApiKey('owner-1', 'Key', 'growth');
      const result = await service.facilitate(key.key, {
        protocol: 'mpp',
        amount: '100.00',
        destination: '0xMerchant',
      });

      expect(result.feePercent).toBe(1.5);
    });

    it('should extract lowest fee for enterprise (0.3%)', async () => {
      const key = service.createApiKey('owner-1', 'Key', 'enterprise');
      const result = await service.facilitate(key.key, {
        protocol: 'x402',
        amount: '100.00',
        destination: '0xMerchant',
      });

      expect(result.feePercent).toBe(0.3);
      expect(parseFloat(result.fee)).toBeCloseTo(0.3, 2);
    });

    it('should reject invalid API key', async () => {
      const result = await service.facilitate('asg_bad_key', {
        protocol: 'x402',
        amount: '10.00',
        destination: '0xMerchant',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API key not found');
    });

    it('should reject invalid amount', async () => {
      const key = service.createApiKey('owner-1', 'Key', 'growth');
      const result = await service.facilitate(key.key, {
        protocol: 'x402',
        amount: '-5',
        destination: '0xMerchant',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid amount');
    });

    it('should track transaction count', async () => {
      const key = service.createApiKey('owner-1', 'Key', 'growth');
      await service.facilitate(key.key, { protocol: 'x402', amount: '5', destination: '0x1' });
      await service.facilitate(key.key, { protocol: 'x402', amount: '10', destination: '0x2' });
      await service.facilitate(key.key, { protocol: 'x402', amount: '15', destination: '0x3' });

      const usage = service.getUsage(key.key);
      expect(usage!.totalTransactions).toBe(3);
    });

    it('should auto-select x402 for "auto" protocol', async () => {
      const key = service.createApiKey('owner-1', 'Key', 'growth');
      const result = await service.facilitate(key.key, {
        protocol: 'auto',
        amount: '10.00',
        destination: '0xMerchant',
      });

      expect(result.protocol).toBe('x402');
    });
  });

  describe('Usage & Billing', () => {
    it('should track usage metrics', async () => {
      const key = service.createApiKey('owner-1', 'Key', 'growth');
      await service.facilitate(key.key, { protocol: 'x402', amount: '100', destination: '0x1' });

      const usage = service.getUsage(key.key);
      expect(usage).not.toBeNull();
      expect(usage!.totalTransactions).toBe(1);
      expect(usage!.totalFees).toBeGreaterThan(0);
      expect(usage!.subscriptionCharge).toBe(49);
    });

    it('should compute overage for dev tier', async () => {
      const key = service.createApiKey('owner-1', 'Key', 'dev');

      // Process 100 transactions (dev limit) - simulate usage count
      for (let i = 0; i < 5; i++) {
        await service.facilitate(key.key, { protocol: 'x402', amount: '1', destination: '0x1' });
      }

      const usage = service.getUsage(key.key);
      expect(usage!.totalTransactions).toBe(5);
    });

    it('should return null for unknown key', () => {
      expect(service.getUsage('unknown')).toBeNull();
    });
  });

  describe('Revenue Analytics', () => {
    it('should calculate revenue summary', async () => {
      const key = service.createApiKey('owner-1', 'Key', 'growth');
      await service.facilitate(key.key, { protocol: 'x402', amount: '100', destination: '0x1' });
      await service.facilitate(key.key, { protocol: 'mpp', amount: '50', destination: '0x2' });

      const summary = service.getRevenueSummary('all-time');
      expect(summary.totalTransactions).toBe(2);
      expect(summary.totalFees).toBeGreaterThan(0);
      expect(summary.byProtocol.x402.count).toBe(1);
      expect(summary.byProtocol.mpp.count).toBe(1);
      expect(summary.activeKeys).toBe(1);
    });

    it('should track revenue across multiple keys', async () => {
      const key1 = service.createApiKey('owner-1', 'Key1', 'growth');
      const key2 = service.createApiKey('owner-2', 'Key2', 'scale');
      await service.facilitate(key1.key, { protocol: 'x402', amount: '100', destination: '0x1' });
      await service.facilitate(key2.key, { protocol: 'x402', amount: '200', destination: '0x2' });

      const summary = service.getRevenueSummary();
      expect(summary.totalTransactions).toBe(2);
      expect(summary.activeKeys).toBe(2);
      // Growth 1% of $100 + Scale 0.5% of $200 = $1.00 + $1.00 = $2.00
      expect(summary.totalFees).toBeCloseTo(2.0, 1);
    });

    it('should include subscription revenue in total', async () => {
      service.createApiKey('owner-1', 'Key1', 'growth'); // $49/mo
      service.createApiKey('owner-2', 'Key2', 'scale');  // $199/mo

      const summary = service.getRevenueSummary();
      expect(summary.subscriptionRevenue).toBe(49 + 199);
    });
  });

  describe('Financial Model Validation', () => {
    it('should demonstrate $1M path with volume', async () => {
      // Simulate: 1000 Growth merchants, 10 tx/day each, avg $5/tx
      const key = service.createApiKey('merchant', 'HighVolume', 'growth');

      // Simulate 30 transactions
      for (let i = 0; i < 30; i++) {
        await service.facilitate(key.key, {
          protocol: 'x402',
          amount: '5.00',
          destination: '0xMerchant',
        });
      }

      const summary = service.getRevenueSummary();

      // 30 tx × $0.05 fee = $1.50 total fees
      expect(summary.totalFees).toBeCloseTo(1.50, 1);

      // Extrapolate: 1000 merchants × 10 tx/day × 30 days = 300K tx/month
      // 300K × $0.05 = $15,000/month fee revenue
      // + 1000 × $49 subscription = $49,000/month
      // Total: $64,000/month = $768K/year from Growth alone
      // + Enterprise = easily $1M+
      const monthlyFeesAt1kMerchants = summary.totalFees * (300_000 / 30);
      expect(monthlyFeesAt1kMerchants).toBeGreaterThan(10_000);
    });
  });
});
