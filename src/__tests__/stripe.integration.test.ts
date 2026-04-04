/**
 * Integration Tests — Stripe MPP (Live API)
 *
 * These tests hit the REAL Stripe API using credentials from environment variables.
 * They are SKIPPED by default (no env vars = no tests).
 *
 * To run:
 *   STRIPE_SECRET_KEY=sk_live_... npx vitest run src/__tests__/stripe.integration.test.ts
 *
 * ⚠️  These tests create real PaymentIntents. Each test cancels its PI after assertion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { StripePaymentAdapter } from '../adapters/stripe';

// ─── Gate: skip if no env vars ─────────────────────────────────────

const SK = process.env.STRIPE_SECRET_KEY;
const SKIP = !SK;

function describeIf(condition: boolean, name: string, fn: () => void) {
  if (condition) {
    describe.skip(name, fn);
  } else {
    describe(name, fn);
  }
}

// ─── helpers ────────────────────────────────────────────────────

const pisToCancel: string[] = [];

async function cancelPi(piId: string) {
  if (!SK) return;
  try {
    await fetch(`https://api.stripe.com/v1/payment_intents/${piId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${SK}:`).toString('base64')}`,
        'Stripe-Version': '2026-03-04.preview',
      },
    });
  } catch {
    // best-effort cleanup
  }
}

afterEach(async () => {
  for (const piId of pisToCancel) {
    await cancelPi(piId);
  }
  pisToCancel.length = 0;
});

// ─── Tests ──────────────────────────────────────────────────────

describeIf(SKIP, 'Stripe MPP — Live Integration', () => {
  it('creates crypto deposit PaymentIntent via Tempo', async () => {
    const logs: string[] = [];
    const adapter = new StripePaymentAdapter({
      stripeSecretKey: SK!,
      logger: (msg) => logs.push(msg),
    });

    const pi = await adapter.createCryptoPaymentIntent(100, 'usd');
    expect(pi).not.toBeNull();
    expect(pi!.id).toMatch(/^pi_/);
    expect(pi!.status).toBe('requires_action');
    expect(pi!.amount).toBe(100);
    expect(pi!.currency).toBe('usd');

    // Verify deposit address
    const depositAddr = pi!.next_action?.crypto_display_details?.deposit_addresses?.tempo?.address;
    expect(depositAddr).toBeDefined();
    expect(depositAddr).toMatch(/^0x/);

    // Verify USDC token
    const tokens = pi!.next_action?.crypto_display_details?.deposit_addresses?.tempo?.supported_tokens;
    expect(tokens).toBeDefined();
    expect(tokens!.length).toBeGreaterThan(0);
    expect(tokens![0].token_currency).toBe('usdc');

    pisToCancel.push(pi!.id);

    // Verify logging
    expect(logs.some((l) => l.includes('Crypto PI:'))).toBe(true);
    expect(logs.some((l) => l.includes('Deposit'))).toBe(true);
  }, 15_000);

  it('detects live mode', () => {
    const adapter = new StripePaymentAdapter({
      stripeSecretKey: SK!,
    });
    expect(adapter.caip2Id).toBe('stripe:live');
  });

  it('verifies account info matches', async () => {
    const response = await fetch('https://api.stripe.com/v1/account', {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${SK}:`).toString('base64')}`,
      },
    });
    const account = await response.json() as any;
    expect(account.id).toBe('acct_1T6hdDPCMcovv6hJ');
    expect(account.business_profile.name).toBe('ASG Compute');
  }, 10_000);

  it('cancels PaymentIntent after creation', async () => {
    const adapter = new StripePaymentAdapter({
      stripeSecretKey: SK!,
    });

    const pi = await adapter.createCryptoPaymentIntent(100, 'usd');
    expect(pi).not.toBeNull();

    // Cancel it
    const cancelRes = await fetch(
      `https://api.stripe.com/v1/payment_intents/${pi!.id}/cancel`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${SK}:`).toString('base64')}`,
          'Stripe-Version': '2026-03-04.preview',
        },
      }
    );
    const cancelled = await cancelRes.json() as any;
    expect(cancelled.status).toBe('canceled');
  }, 15_000);

  it('server challenge generates valid header', () => {
    const adapter = new StripePaymentAdapter({
      stripeSecretKey: SK!,
      networkId: 'acct_1T6hdDPCMcovv6hJ',
    });

    const header = adapter.buildServerChallenge('100', {
      currency: 'usd',
      description: 'Integration test',
    });

    expect(header).toMatch(/^Payment /);
    expect(header).toContain('method="stripe"');
    expect(header).toContain('realm="pay.asgcard.dev"');
  });
});
