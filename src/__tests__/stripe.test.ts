import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StripePaymentAdapter } from '../adapters/stripe';
import { base64urlEncode, base64urlDecode } from '../mpp';
import type { MppChallenge } from '../mpp';

// ─── Helper: create test challenge ──────────────────────────────────

function makeChallenge(overrides: Partial<MppChallenge> = {}): MppChallenge {
  return {
    id: 'ch_test_123',
    realm: 'pay.asgcard.dev',
    method: 'stripe',
    intent: 'charge',
    request: base64urlEncode(JSON.stringify({
      amount: '1000',
      currency: 'usd',
      decimals: 2,
      recipient: 'acct_merchant_123',
      methodDetails: { networkId: 'internal', paymentMethodTypes: ['card'] },
    })),
    ...overrides,
  };
}

// ─── Constructor ────────────────────────────────────────────────────

describe('StripePaymentAdapter', () => {
  describe('constructor', () => {
    it('creates adapter with secret key', () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
      });
      expect(adapter.chainName).toBe('Stripe MPP');
      expect(adapter.caip2Id).toBe('stripe:test');
    });

    it('detects live mode from sk_live_ key', () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_live_abc123',
      });
      expect(adapter.caip2Id).toBe('stripe:live');
    });

    it('rejects empty secret key', () => {
      expect(() => {
        new StripePaymentAdapter({ stripeSecretKey: '' });
      }).toThrow(/stripeSecretKey/);
    });

    it('uses default values', () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
      });
      // Should not throw, defaults applied
      expect(adapter).toBeDefined();
    });
  });

  // ─── getAddress ──────────────────────────────────────────────────

  describe('getAddress', () => {
    it('returns SPT-based address when external SPT set', () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
      });
      adapter.setSptToken('spt_test_grant_abc123def456');
      expect(adapter.getAddress()).toMatch(/^spt:/);
    });

    it('returns pm-based address when paymentMethodId set', () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
        paymentMethodId: 'pm_card_visa',
      });
      expect(adapter.getAddress()).toMatch(/^pm:/);
    });

    it('returns stripe-key-based address as fallback', () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
      });
      expect(adapter.getAddress()).toMatch(/^stripe:/);
    });

    it('prioritizes SPT over paymentMethodId', () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
        paymentMethodId: 'pm_card_visa',
      });
      adapter.setSptToken('spt_test_123');
      expect(adapter.getAddress()).toMatch(/^spt:/);
    });
  });

  // ─── setSptToken ─────────────────────────────────────────────────

  describe('setSptToken', () => {
    it('updates the external SPT', () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
      });
      adapter.setSptToken('spt_new_token');
      expect(adapter.getAddress()).toMatch(/^spt:/);
    });

    it('logs token update', () => {
      const logs: string[] = [];
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
        logger: (msg) => logs.push(msg),
      });
      adapter.setSptToken('spt_new_token_123');
      expect(logs.some((l) => l.includes('External SPT set'))).toBe(true);
    });
  });

  // ─── setMppChallenge ─────────────────────────────────────────────

  describe('setMppChallenge', () => {
    it('stores challenge for credential building', () => {
      const logs: string[] = [];
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
        logger: (msg) => logs.push(msg),
      });
      const challenge = makeChallenge();
      adapter.setMppChallenge(challenge);
      expect(logs.some((l) => l.includes('Challenge received'))).toBe(true);
    });
  });

  // ─── pay() — Delegated mode (external SPT) ───────────────────────

  describe('pay() — delegated mode', () => {
    it('returns null when no SPT and no paymentMethodId', async () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
      });
      const result = await adapter.pay('dest', '1000', 'stripe');
      expect(result).toBeNull();
    });

    it('returns null for invalid amount', async () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
      });
      adapter.setSptToken('spt_test');
      const result = await adapter.pay('dest', 'invalid', 'stripe');
      expect(result).toBeNull();
    });

    it('returns null for zero amount', async () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
      });
      adapter.setSptToken('spt_test');
      const result = await adapter.pay('dest', '0', 'stripe');
      expect(result).toBeNull();
    });

    it('returns null for negative amount', async () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
      });
      adapter.setSptToken('spt_test');
      const result = await adapter.pay('dest', '-100', 'stripe');
      expect(result).toBeNull();
    });

    it('builds credential when challenge + SPT are set', async () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
      });
      adapter.setSptToken('spt_test_grant_token');
      adapter.setMppChallenge(makeChallenge());

      const result = await adapter.pay('acct_merchant', '1000', 'stripe');
      expect(result).toBeTruthy();

      // Should be a valid base64url credential
      const decoded = JSON.parse(base64urlDecode(result!));
      expect(decoded.challenge.id).toBe('ch_test_123');
      expect(decoded.challenge.realm).toBe('pay.asgcard.dev');
      expect(decoded.challenge.method).toBe('stripe');
      expect(decoded.payload.spt).toBe('spt_test_grant_token');
      expect(decoded.source).toMatch(/^spt:/);
    });

    it('stores credential for later retrieval', async () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
      });
      adapter.setSptToken('spt_test');
      adapter.setMppChallenge(makeChallenge());

      const result = await adapter.pay('dest', '500', 'stripe');
      expect(adapter.getLastCredential()).toBe(result);
    });
  });

  // ─── pay() — Autonomous mode (no challenge, direct PI) ────────────

  describe('pay() — fallback mode (no challenge)', () => {
    it('creates PaymentIntent when SPT set but no challenge', async () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
        stripeApiBase: 'http://mock-stripe.test',
      });
      adapter.setSptToken('spt_test_123');

      // Mock fetch for PaymentIntent creation
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'pi_test_mock_123',
          status: 'succeeded',
          amount: 1000,
          currency: 'usd',
        }),
      });

      try {
        const result = await adapter.pay('dest', '1000', 'stripe');
        expect(result).toBe('pi_test_mock_123');

        // Verify fetch was called with correct URL
        expect(globalThis.fetch).toHaveBeenCalledWith(
          'http://mock-stripe.test/v1/payment_intents',
          expect.objectContaining({ method: 'POST' })
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns null on PaymentIntent API error', async () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
        stripeApiBase: 'http://mock-stripe.test',
      });
      adapter.setSptToken('spt_test_123');

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Card declined' } }),
      });

      try {
        const result = await adapter.pay('dest', '1000', 'stripe');
        expect(result).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ─── pay() — Autonomous SPT creation ──────────────────────────────

  describe('pay() — autonomous mode (paymentMethodId)', () => {
    it('creates SPT then builds credential', async () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
        paymentMethodId: 'pm_card_visa',
        stripeApiBase: 'http://mock-stripe.test',
      });
      adapter.setMppChallenge(makeChallenge());

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'spt_created_auto',
          object: 'shared_payment.granted_token',
        }),
      });

      try {
        const result = await adapter.pay('dest', '1000', 'stripe');
        expect(result).toBeTruthy();

        // Verify SPT creation was called
        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.stringContaining('granted_tokens'),
          expect.objectContaining({ method: 'POST' })
        );

        // Verify credential contains the auto-created SPT
        const decoded = JSON.parse(base64urlDecode(result!));
        expect(decoded.payload.spt).toBe('spt_created_auto');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns null when SPT creation fails', async () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
        paymentMethodId: 'pm_card_visa',
        stripeApiBase: 'http://mock-stripe.test',
      });
      adapter.setMppChallenge(makeChallenge());

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Invalid pm' } }),
      });

      try {
        const result = await adapter.pay('dest', '1000', 'stripe');
        expect(result).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ─── buildServerChallenge ────────────────────────────────────────

  describe('buildServerChallenge', () => {
    it('builds a valid WWW-Authenticate header', () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
        networkId: 'my-network',
      });

      const header = adapter.buildServerChallenge('500', {
        currency: 'usd',
        description: 'API access',
      });

      expect(header).toMatch(/^Payment /);
      expect(header).toContain('method="stripe"');
      expect(header).toContain('intent="charge"');
      expect(header).toContain('realm="pay.asgcard.dev"');
      expect(header).toContain('request="');
    });

    it('includes amount and currency in encoded request', () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
        networkId: 'test-net',
      });

      const header = adapter.buildServerChallenge('100', { currency: 'eur' });

      // Extract and decode request
      const requestMatch = header.match(/request="([^"]+)"/);
      expect(requestMatch).toBeTruthy();

      const decoded = JSON.parse(base64urlDecode(requestMatch![1]));
      expect(decoded.amount).toBe('100');
      expect(decoded.currency).toBe('eur');
      expect(decoded.methodDetails.networkId).toBe('test-net');
    });
  });

  // ─── Logger ──────────────────────────────────────────────────────

  describe('logger', () => {
    it('is silent by default', async () => {
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
      });
      // Should not throw
      const result = await adapter.pay('dest', '100', 'stripe');
      expect(result).toBeNull(); // No SPT, no PM → null
    });

    it('logs operations when logger provided', async () => {
      const logs: string[] = [];
      const adapter = new StripePaymentAdapter({
        stripeSecretKey: 'sk_test_abc123',
        logger: (msg) => logs.push(msg),
      });
      adapter.setSptToken('spt_test');
      adapter.setMppChallenge(makeChallenge());
      await adapter.pay('dest', '500', 'stripe');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some((l) => l.includes('Stripe/MPP'))).toBe(true);
    });
  });
});
