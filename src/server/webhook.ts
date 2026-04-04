import { Logger, noopLogger } from '../logger';

/**
 * Configuration for Stripe webhook handler.
 */
export interface WebhookConfig {
  /** Stripe webhook signing secret (whsec_...). */
  signingSecret: string;
  /** Callback for successful payments. */
  onPaymentSuccess?: (event: WebhookEvent) => void | Promise<void>;
  /** Callback for failed payments. */
  onPaymentFailure?: (event: WebhookEvent) => void | Promise<void>;
  /** Idempotency: track processed event IDs to prevent replay. */
  processedEventIds?: Set<string>;
  /** Logger function. */
  logger?: Logger;
}

/** Simplified webhook event representation. */
export interface WebhookEvent {
  id: string;
  type: string;
  amount?: number;
  currency?: string;
  paymentIntentId?: string;
  metadata?: Record<string, string>;
  timestamp: Date;
}

/**
 * Creates a Connect/Express-compatible webhook handler for Stripe events.
 *
 * Uses HMAC signature verification via the raw request body.
 * Supports idempotency guard to prevent duplicate processing.
 *
 * @example
 * ```ts
 * const handler = createWebhookHandler({
 *   signingSecret: process.env.STRIPE_WEBHOOK_SECRET!,
 *   onPaymentSuccess: (event) => {
 *     console.log(`Payment received: ${event.amount} ${event.currency}`);
 *   },
 * });
 *
 * app.post('/webhook', express.raw({ type: 'application/json' }), handler);
 * ```
 */
export function createWebhookHandler(config: WebhookConfig) {
  const log = config.logger ?? noopLogger;
  const processedIds = config.processedEventIds ?? new Set<string>();

  return async (
    req: any,
    res: any,
    _next?: (err?: any) => void
  ) => {
    const sig = req.headers['stripe-signature'] as string;
    if (!sig) {
      log('[webhook] ❌ Missing stripe-signature header');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing stripe-signature header' }));
      return;
    }

    // Get raw body
    const rawBody = typeof req.body === 'string'
      ? req.body
      : req.body instanceof Buffer
        ? req.body.toString('utf-8')
        : JSON.stringify(req.body);

    // Verify HMAC signature (simplified — in production use stripe.webhooks.constructEvent)
    if (!verifySignature(rawBody, sig, config.signingSecret)) {
      log('[webhook] ❌ Invalid signature');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid webhook signature' }));
      return;
    }

    let event: any;
    try {
      event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      log('[webhook] ❌ Failed to parse event body');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    // Idempotency guard
    if (processedIds.has(event.id)) {
      log(`[webhook] ⏭️ Duplicate event: ${event.id}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true, duplicate: true }));
      return;
    }

    processedIds.add(event.id);

    // Route based on event type
    const webhookEvent: WebhookEvent = {
      id: event.id,
      type: event.type,
      amount: event.data?.object?.amount,
      currency: event.data?.object?.currency,
      paymentIntentId: event.data?.object?.id,
      metadata: event.data?.object?.metadata,
      timestamp: new Date(),
    };

    try {
      if (event.type === 'payment_intent.succeeded' && config.onPaymentSuccess) {
        log(`[webhook] ✅ Payment succeeded: ${webhookEvent.paymentIntentId}`);
        await config.onPaymentSuccess(webhookEvent);
      } else if (event.type === 'payment_intent.payment_failed' && config.onPaymentFailure) {
        log(`[webhook] ❌ Payment failed: ${webhookEvent.paymentIntentId}`);
        await config.onPaymentFailure(webhookEvent);
      } else {
        log(`[webhook] 📋 Unhandled event type: ${event.type}`);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    } catch (err: any) {
      log(`[webhook] ❌ Handler error: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Webhook handler error' }));
    }
  };
}

/**
 * Simplified HMAC verification for webhook signatures.
 * In production, use Stripe's official `stripe.webhooks.constructEvent()`.
 */
function verifySignature(payload: string, sig: string, secret: string): boolean {
  try {
    // Parse Stripe signature header format: t=timestamp,v1=hash
    const parts = sig.split(',');
    const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
    const hash = parts.find((p) => p.startsWith('v1='))?.slice(3);

    if (!timestamp || !hash) return false;

    // In production: compute HMAC-SHA256 of `${timestamp}.${payload}` with secret
    // For SDK purposes, we trust the Stripe library to do this
    const crypto = require('crypto');
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}
