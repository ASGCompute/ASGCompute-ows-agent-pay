/**
 * Tests for FeeCalculator — revenue calculation.
 */

import { FeeCalculator } from '../facilitator/fee-calculator';

describe('FeeCalculator', () => {
  let calc: FeeCalculator;

  beforeEach(() => {
    calc = new FeeCalculator();
  });

  describe('calculate() — basic fees', () => {
    it('should calculate fee for Growth plan at 1.0%', () => {
      const fee = calc.calculate(100, 'growth', 'x402');
      expect(fee.feePercent).toBe(1.0);
      expect(fee.calculatedFee).toBeCloseTo(1.0, 4);
      expect(fee.finalFee).toBe(1.0);
      expect(fee.totalCost).toBeCloseTo(101.0, 4);
    });

    it('should calculate fee for Scale plan at 0.5%', () => {
      const fee = calc.calculate(100, 'scale', 'x402');
      expect(fee.feePercent).toBe(0.5);
      expect(fee.finalFee).toBeCloseTo(0.5, 4);
    });

    it('should calculate fee for Enterprise plan at 0.3%', () => {
      const fee = calc.calculate(100, 'enterprise', 'x402');
      expect(fee.feePercent).toBe(0.3);
      expect(fee.finalFee).toBeCloseTo(0.3, 4);
    });

    it('should calculate fee for Dev plan at 1.5%', () => {
      const fee = calc.calculate(10, 'dev', 'x402');
      expect(fee.feePercent).toBe(1.5);
      expect(fee.finalFee).toBeCloseTo(0.15, 4);
    });
  });

  describe('calculate() — minimum fee', () => {
    it('should apply minimum fee for tiny amounts', () => {
      const fee = calc.calculate(0.01, 'growth', 'x402');
      // 0.01 * 1.5% = 0.00015 < minFee of 0.002
      expect(fee.minFeeApplied).toBe(true);
      expect(fee.finalFee).toBe(0.002);
    });

    it('should not apply min fee for large amounts', () => {
      const fee = calc.calculate(100, 'growth', 'x402');
      expect(fee.minFeeApplied).toBe(false);
    });
  });

  describe('calculate() — micropayment premium', () => {
    it('should add 0.5% premium for sub-$1 transactions', () => {
      const fee = calc.calculate(0.50, 'growth', 'x402');
      // growth base: 1.0% + micropayment: 0.5% = 1.5%
      expect(fee.feePercent).toBe(1.5);
    });

    it('should not add premium for $1+ transactions', () => {
      const fee = calc.calculate(1.00, 'growth', 'x402');
      expect(fee.feePercent).toBe(1.0);
    });
  });

  describe('calculate() — protocol adjustment', () => {
    it('should add 0.5% for MPP protocol', () => {
      const fee = calc.calculate(10, 'growth', 'mpp');
      // growth base: 1.0% + mpp: 0.5% = 1.5%
      expect(fee.feePercent).toBe(1.5);
    });

    it('should not add adjustment for x402', () => {
      const fee = calc.calculate(10, 'growth', 'x402');
      expect(fee.feePercent).toBe(1.0);
    });
  });

  describe('calculate() — net revenue', () => {
    it('should compute net revenue after network costs', () => {
      const fee = calc.calculate(100, 'growth', 'x402', 'eip155:8453');
      // fee = $1.00, network cost = $0.001
      expect(fee.netRevenue).toBeCloseTo(0.999, 3);
    });

    it('should compute net revenue for Ethereum (high gas)', () => {
      const fee = calc.calculate(100, 'growth', 'x402', 'eip155:1');
      // fee = $1.00, network cost = $2.50 → net = negative (we'd lose money!)
      expect(fee.netRevenue).toBe(0); // clamped to 0
    });
  });

  describe('estimateFee()', () => {
    it('should return quick fee estimate', () => {
      const fee = calc.estimateFee(50, 'growth');
      expect(fee).toBeCloseTo(0.5, 4);
    });
  });

  describe('netRevenue()', () => {
    it('should return net revenue for a transaction', () => {
      const rev = calc.netRevenue(100, 'scale', 'x402', 'eip155:8453');
      // 0.5% of $100 = $0.50, minus $0.001 gas = $0.499
      expect(rev).toBeCloseTo(0.499, 3);
    });
  });

  describe('projectRevenue()', () => {
    it('should project revenue from transaction volume', () => {
      const projection = calc.projectRevenue(
        5.00,       // avg tx
        10_000,     // count
        'growth',   // plan
        'x402',     // protocol
        'eip155:8453' // chain
      );

      // 1% of $5 = $0.05/tx → $500 gross fees
      expect(projection.grossFees).toBeCloseTo(500, 0);
      // Network: $0.001 × 10K = $10
      expect(projection.networkCosts).toBeCloseTo(10, 0);
      // Net: $500 - $10 = $490
      expect(projection.netRevenue).toBeCloseTo(490, 0);
      // Margin: ~98%
      expect(projection.margin).toBeGreaterThan(95);
    });

    it('should project enterprise pricing', () => {
      const projection = calc.projectRevenue(
        50.00,
        100_000,
        'enterprise',
        'x402',
        'eip155:8453'
      );

      // 0.3% of $50 = $0.15/tx → $15,000 gross
      expect(projection.grossFees).toBeCloseTo(15_000, 0);
      expect(projection.margin).toBeGreaterThan(99);
    });
  });

  describe('getTier()', () => {
    it('should return tier configuration', () => {
      const tier = calc.getTier('growth');
      expect(tier.monthlyPrice).toBe(49);
      expect(tier.includedTransactions).toBe(10_000);
    });
  });
});
