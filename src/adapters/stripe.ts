import { PaymentAdapter } from './types';
import { Logger, noopLogger } from '../logger';
import {
  MppChallenge,
  MppRequestObject,
  MppStripePayload,
  decodeChallengeRequest,
  buildMppCredential,
  base64urlEncode,
} from '../mpp';

// ─── Types ──────────────────────────────────────────────────────────

/**
 * Configuration for the Stripe MPP adapter.
 *
 * @example
 * ```ts
 * const adapter = new StripePaymentAdapter({
 *   stripeSecretKey: process.env.STRIPE_SECRET_KEY!,
 *   networkId: 'my-business-network',
 * });
 * ```
 */
export interface StripeAdapterOptions {
  /**
   * Stripe secret key (sk_test_... or sk_live_...).
   * Used to create SPTs and PaymentIntents.
   */
  stripeSecretKey: string;

  /**
   * Stripe Business Network ID.
   * Found in Dashboard → Settings → Business profile.
   */
  networkId?: string;

  /**
   * Accepted payment method types.
   * @default ['card']
   */
  paymentMethodTypes?: string[];

  /**
   * Default payment method ID for autonomous agents.
   * e.g. 'pm_card_visa' for test mode.
   * If set, the adapter can create SPTs autonomously.
   */
  paymentMethodId?: string;

  /**
   * Default currency for payments.
   * @default 'usd'
   */
  currency?: string;

  /**
   * SPT expiration window in seconds.
   * @default 300 (5 minutes)
   */
  sptExpirySeconds?: number;

  /**
   * Stripe API base URL.
   * @default 'https://api.stripe.com'
   */
  stripeApiBase?: string;

  /** Optional logger. SDK is silent by default. */
  logger?: Logger;
}

/**
 * Result of creating a Shared Payment Token.
 */
interface SptResult {
  id: string;        // spt_...
  object: string;
  expires_at?: number;
}

/**
 * Result of creating/confirming a PaymentIntent.
 */
interface PaymentIntentResult {
  id: string;        // pi_...
  status: string;
  amount: number;
  currency: string;
  next_action?: {
    crypto_display_details?: {
      deposit_addresses?: Record<string, {
        address: string;
        supported_tokens?: Array<{
          token_currency: string;
          token_contract_address: string;
        }>;
      }>;
    };
  };
}

/**
 * Required Stripe API version for MPP features.
 * @see https://docs.stripe.com/payments/machine/mpp
 */
const STRIPE_API_VERSION = '2026-03-04.preview';

// ─── Stripe MPP Adapter ─────────────────────────────────────────────

/**
 * StripePaymentAdapter — Machine Payments Protocol (MPP) settlement.
 *
 * Implements the full MPP flow for Stripe:
 * 1. Receives 402 + `WWW-Authenticate: Payment` challenge
 * 2. Creates a Shared Payment Token (SPT) via Stripe API
 * 3. Builds MPP Credential with SPT
 * 4. Returns credential for `Authorization: Payment` header
 *
 * Works in two modes:
 * - **Autonomous** (with paymentMethodId): Creates SPTs automatically
 * - **Delegated** (without): Requires external SPT provisioning via `setSptToken()`
 *
 * @example
 * ```ts
 * // Autonomous mode — agent has a payment method on file
 * const adapter = new StripePaymentAdapter({
 *   stripeSecretKey: 'sk_test_...',
 *   networkId: 'my-network',
 *   paymentMethodId: 'pm_card_visa', // test card
 * });
 *
 * // Delegated mode — external system provides SPTs
 * const adapter = new StripePaymentAdapter({
 *   stripeSecretKey: 'sk_test_...',
 * });
 * adapter.setSptToken('spt_...');
 * ```
 *
 * @see https://mpp.dev/payment-methods/stripe — MPP Stripe method spec
 * @see https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens
 */
export class StripePaymentAdapter implements PaymentAdapter {
  public readonly chainName = 'Stripe MPP';
  public readonly caip2Id: string;

  private secretKey: string;
  private networkId: string;
  private paymentMethodTypes: string[];
  private paymentMethodId: string | null;
  private currency: string;
  private sptExpirySeconds: number;
  private stripeApiBase: string;
  private log: Logger;

  /** Externally-provided SPT for delegated mode */
  private externalSpt: string | null = null;

  /** Last MPP challenge processed (for credential building) */
  private lastChallenge: MppChallenge | null = null;

  constructor(options: StripeAdapterOptions) {
    if (!options.stripeSecretKey) {
      throw new Error(
        'StripePaymentAdapter requires a stripeSecretKey. ' +
        'Get one from https://dashboard.stripe.com/apikeys'
      );
    }

    this.secretKey = options.stripeSecretKey;
    this.networkId = options.networkId ?? 'internal';
    this.paymentMethodTypes = options.paymentMethodTypes ?? ['card'];
    this.paymentMethodId = options.paymentMethodId ?? null;
    this.currency = options.currency ?? 'usd';
    this.sptExpirySeconds = options.sptExpirySeconds ?? 300;
    this.stripeApiBase = options.stripeApiBase ?? 'https://api.stripe.com';
    this.log = options.logger ?? noopLogger;

    // CAIP-2-style identifier for Stripe
    this.caip2Id = this.secretKey.startsWith('sk_live')
      ? 'stripe:live'
      : 'stripe:test';
  }

  /**
   * Set or update an externally-provided SPT token.
   * Used in delegated mode when an external system provides the SPT.
   */
  setSptToken(token: string): void {
    this.externalSpt = token;
    this.log(`[Stripe/MPP] 🔑 External SPT set: ${token.slice(0, 16)}…`);
  }

  /**
   * Store a parsed MPP challenge for credential building.
   * Called by OwsClient when a 402 with `WWW-Authenticate: Payment method="stripe"` is received.
   */
  setMppChallenge(challenge: MppChallenge): void {
    this.lastChallenge = challenge;
    this.log(`[Stripe/MPP] 📋 Challenge received: id=${challenge.id}, realm=${challenge.realm}`);
  }

  /**
   * Get the last built MPP credential (base64url-encoded).
   * Used by OwsClient to populate the `Authorization: Payment` header.
   */
  getLastCredential(): string | null {
    return this._lastCredential;
  }
  private _lastCredential: string | null = null;

  getAddress(): string {
    if (this.externalSpt) return `spt:${this.externalSpt.slice(0, 16)}…`;
    if (this.paymentMethodId) return `pm:${this.paymentMethodId.slice(0, 16)}…`;
    return `stripe:${this.secretKey.slice(0, 12)}…`;
  }

  /**
   * Execute a Stripe MPP payment.
   *
   * This method handles the full SPT lifecycle:
   * 1. If an external SPT is set → use it directly
   * 2. If paymentMethodId is set → create SPT autonomously via Stripe API
   * 3. Build MPP Credential with the SPT
   * 4. Return credential string (used as "tx hash" equivalent)
   *
   * @param destination - Recipient (Stripe account or payment endpoint)
   * @param amount - Amount in smallest currency unit (e.g. cents)
   * @param network - Network identifier (ignored for Stripe, kept for interface compat)
   * @returns Base64url-encoded MPP credential string, or null on failure
   */
  async pay(
    destination: string,
    amount: string,
    network: string
  ): Promise<string | null> {
    const tag = '[Stripe/MPP]';

    try {
      const amountInt = parseInt(amount, 10);
      if (isNaN(amountInt) || amountInt <= 0) {
        this.log(`${tag} ❌ Invalid amount: ${amount}`);
        return null;
      }

      const formatted = `$${(amountInt / 100).toFixed(2)}`;
      this.log(`${tag} 🚀 ${formatted} (${this.currency.toUpperCase()}) → ${destination.slice(0, 20)}…`);

      // ── Step 1: Get or create SPT ──────────────────────────────
      let sptId: string;

      if (this.externalSpt) {
        // Delegated mode: use externally-provided SPT
        sptId = this.externalSpt;
        this.log(`${tag} 🔑 Using external SPT: ${sptId.slice(0, 16)}…`);
      } else if (this.paymentMethodId) {
        // Autonomous mode: create SPT via Stripe API
        this.log(`${tag} 🔧 Creating SPT for pm: ${this.paymentMethodId.slice(0, 16)}…`);
        const spt = await this.createSpt(amountInt, this.currency);
        if (!spt) {
          this.log(`${tag} ❌ SPT creation failed`);
          return null;
        }
        sptId = spt.id;
        this.log(`${tag} ✅ SPT created: ${sptId.slice(0, 20)}…`);
      } else {
        this.log(`${tag} ❌ No SPT and no paymentMethodId — cannot pay autonomously`);
        return null;
      }

      // ── Step 2: Build MPP Credential ───────────────────────────
      if (this.lastChallenge) {
        // Full MPP flow: build proper credential with challenge echo
        const credential = buildMppCredential(
          this.lastChallenge,
          this.getAddress(),
          { spt: sptId } as MppStripePayload
        );
        this._lastCredential = credential;
        this.log(`${tag} 📝 Credential built (challenge: ${this.lastChallenge.id})`);
        return credential;
      } else {
        // Fallback: SPT-only mode (direct Stripe API, no MPP challenge)
        // Create PaymentIntent directly
        this.log(`${tag} 💳 No MPP challenge — creating PaymentIntent directly`);
        const pi = await this.createPaymentIntent(sptId, amountInt, this.currency);
        if (!pi) {
          this.log(`${tag} ❌ PaymentIntent creation failed`);
          return null;
        }
        this.log(`${tag} ✅ PaymentIntent: ${pi.id} (${pi.status})`);
        return pi.id;
      }
    } catch (error: any) {
      this.log(`${tag} ❌ ${error.message}`);
      return null;
    }
  }

  // ─── Stripe API Methods ─────────────────────────────────────────

  /**
   * Create a Shared Payment Token (SPT) via Stripe API.
   *
   * Test mode: POST /v1/test_helpers/shared_payment/granted_tokens
   * Live mode: POST /v1/shared_payment/issued_tokens (TBD by Stripe)
   */
  async createSpt(amount: number, currency: string): Promise<SptResult | null> {
    const isTest = this.secretKey.startsWith('sk_test');
    const endpoint = isTest
      ? '/v1/test_helpers/shared_payment/granted_tokens'
      : '/v1/shared_payment/issued_tokens';

    const expiresAt = Math.floor((Date.now() + this.sptExpirySeconds * 1000) / 1000);

    const body = new URLSearchParams();
    body.append('payment_method', this.paymentMethodId!);
    body.append('usage_limits[currency]', currency);
    body.append('usage_limits[max_amount]', amount.toString());
    body.append('usage_limits[expires_at]', expiresAt.toString());

    try {
      const response = await fetch(`${this.stripeApiBase}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Stripe-Version': STRIPE_API_VERSION,
        },
        body,
      });

      if (!response.ok) {
        const error = await response.json() as any;
        this.log(`[Stripe/MPP] ❌ SPT API error: ${error?.error?.message || response.statusText}`);
        return null;
      }

      return await response.json() as SptResult;
    } catch (error: any) {
      this.log(`[Stripe/MPP] ❌ SPT request failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Create and confirm a PaymentIntent using an SPT.
   * Used in fallback mode (no MPP challenge, direct Stripe API).
   */
  async createPaymentIntent(
    sptId: string,
    amount: number,
    currency: string
  ): Promise<PaymentIntentResult | null> {
    const body = new URLSearchParams();
    body.append('amount', amount.toString());
    body.append('currency', currency);
    body.append('confirm', 'true');
    body.append('automatic_payment_methods[enabled]', 'true');
    body.append('payment_method_data[shared_payment_granted_token]', sptId);
    body.append('metadata[protocol]', 'mpp');
    body.append('metadata[agent]', 'asgcard-pay');

    try {
      const response = await fetch(`${this.stripeApiBase}/v1/payment_intents`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Stripe-Version': STRIPE_API_VERSION,
        },
        body,
      });

      if (!response.ok) {
        const error = await response.json() as any;
        this.log(`[Stripe/MPP] ❌ PI error: ${error?.error?.message || response.statusText}`);
        return null;
      }

      return await response.json() as PaymentIntentResult;
    } catch (error: any) {
      this.log(`[Stripe/MPP] ❌ PI request failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Create a crypto deposit-mode PaymentIntent.
   * This is the verified-working flow for MPP on Stripe.
   * Uses Tempo network + USDC stablecoins.
   *
   * @param amount - Amount in cents (e.g. 100 = $1.00)
   * @param currency - Currency code (default: 'usd')
   * @returns PaymentIntentResult with deposit address, or null on failure
   *
   * @example
   * ```ts
   * const pi = await adapter.createCryptoPaymentIntent(100, 'usd');
   * // pi.next_action.crypto_display_details.deposit_addresses.tempo.address
   * ```
   */
  async createCryptoPaymentIntent(
    amount: number,
    currency: string = 'usd'
  ): Promise<PaymentIntentResult | null> {
    const body = new URLSearchParams();
    body.append('amount', amount.toString());
    body.append('currency', currency);
    body.append('payment_method_types[]', 'crypto');
    body.append('payment_method_data[type]', 'crypto');
    body.append('payment_method_options[crypto][mode]', 'deposit');
    body.append('payment_method_options[crypto][deposit_options][networks][]', 'tempo');
    body.append('confirm', 'true');
    body.append('metadata[protocol]', 'mpp');
    body.append('metadata[agent]', 'asgcard-pay');

    try {
      const response = await fetch(`${this.stripeApiBase}/v1/payment_intents`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Stripe-Version': STRIPE_API_VERSION,
        },
        body,
      });

      if (!response.ok) {
        const error = await response.json() as any;
        this.log(`[Stripe/MPP] ❌ Crypto PI error: ${error?.error?.message || response.statusText}`);
        return null;
      }

      const pi = await response.json() as PaymentIntentResult;
      this.log(`[Stripe/MPP] ✅ Crypto PI: ${pi.id} (${pi.status})`);

      // Extract deposit address if available
      const depositAddr = pi.next_action?.crypto_display_details?.deposit_addresses?.tempo?.address;
      if (depositAddr) {
        this.log(`[Stripe/MPP] 📬 Deposit → ${depositAddr}`);
      }

      return pi;
    } catch (error: any) {
      this.log(`[Stripe/MPP] ❌ Crypto PI request failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Build and return a fully-formed MPP Challenge for server-side use.
   * Useful if you want to GATE your own API with MPP 402.
   *
   * @param amount - Amount to charge (in smallest unit)
   * @param options - Challenge options
   * @returns WWW-Authenticate header value
   */
  buildServerChallenge(
    amount: string,
    options: {
      currency?: string;
      description?: string;
      expiresInSeconds?: number;
    } = {}
  ): string {
    const currency = options.currency ?? this.currency;
    const expires = new Date(
      Date.now() + (options.expiresInSeconds ?? this.sptExpirySeconds) * 1000
    ).toISOString();

    // Build the request object
    const requestObj: MppRequestObject = {
      amount,
      currency,
      description: options.description,
      methodDetails: {
        networkId: this.networkId,
        paymentMethodTypes: this.paymentMethodTypes,
      },
    };

    const requestB64 = base64urlEncode(JSON.stringify(requestObj));

    // Generate challenge ID (HMAC-bound in production, random for now)
    const challengeId = `ch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    return `Payment id="${challengeId}", realm="pay.asgcard.dev", method="stripe", intent="charge", expires="${expires}", request="${requestB64}"`;
  }
}
