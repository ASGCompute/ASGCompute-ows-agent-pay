import type { IncomingMessage, ServerResponse } from 'http';
import { createX402Gate, type X402GateConfig } from './x402-gate';
import { createMppGate, type MppGateConfig } from './mpp-gate';
import { Logger, noopLogger } from '../logger';

/**
 * Unified Payment Gate — supports both x402 and MPP simultaneously.
 */
export interface PaymentGateConfig {
  /** x402 configuration. */
  x402: Omit<X402GateConfig, 'logger'>;
  /** MPP configuration. */
  mpp: Omit<MppGateConfig, 'logger'>;
  /** Shared logger. */
  logger?: Logger;
}

/**
 * Creates a dual-protocol payment gate that accepts both x402 and MPP.
 *
 * Detection logic:
 * - `X-PAYMENT` header → x402 flow
 * - `Authorization: Payment` header → MPP flow
 * - Neither present → returns both challenge types simultaneously
 *
 * @example
 * ```ts
 * app.post('/api/premium', createPaymentGate({
 *   x402: { payTo: '0x...', amount: '500000', asset: 'USDC', network: 'eip155:8453' },
 *   mpp: { realm: 'api.example.com', method: 'stripe', amount: '50', recipient: 'acct_xxx' },
 * }), handler);
 * ```
 */
export function createPaymentGate(config: PaymentGateConfig) {
  const log = config.logger ?? noopLogger;

  const x402Middleware = createX402Gate({
    ...config.x402,
    logger: log,
  });

  const mppMiddleware = createMppGate({
    ...config.mpp,
    logger: log,
  });

  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: any) => void
  ) => {
    // Detect which protocol the client is using
    const hasX402 = !!(req.headers['x-payment'] || req.headers['X-PAYMENT']);
    const hasAuth = !!(
      req.headers['authorization'] &&
      (req.headers['authorization'] as string).startsWith('Payment ')
    );

    if (hasX402) {
      log('[payment-gate] 🔍 Detected x402 protocol (X-PAYMENT header)');
      return x402Middleware(req, res, next);
    }

    if (hasAuth) {
      log('[payment-gate] 🔍 Detected MPP protocol (Authorization: Payment header)');
      return mppMiddleware(req, res, next);
    }

    // No payment header — return dual-protocol 402 challenge
    log('[payment-gate] 💰 No payment header — returning dual-protocol 402');

    // Build MPP challenge header
    const mppIntent = config.mpp.intent ?? 'payment';
    const mppCurrency = config.mpp.currency ?? 'usd';
    const mppDecimals = config.mpp.decimals ?? 2;
    const ttlMs = config.mpp.ttlMs ?? 300000;

    const challengeId = `ch_${Date.now()}_dual`;
    const expires = new Date(Date.now() + ttlMs).toISOString();

    const requestObj = {
      amount: config.mpp.amount,
      currency: mppCurrency,
      decimals: mppDecimals,
      recipient: config.mpp.recipient,
    };

    const requestEncoded = Buffer.from(JSON.stringify(requestObj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const wwwAuth = `Payment id="${challengeId}",realm="${config.mpp.realm}",method="${config.mpp.method}",intent="${mppIntent}",request="${requestEncoded}",expires="${expires}"`;

    // Build x402 challenge body
    const x402Body = {
      x402Version: config.x402.x402Version ?? 2,
      resource: {
        url: req.url || '/',
        description: config.x402.description || 'Payment required',
        ...(config.x402.usdAmount ? { usdAmount: config.x402.usdAmount } : {}),
      },
      accepts: [
        {
          scheme: config.x402.scheme ?? 'exact',
          network: config.x402.network,
          amount: config.x402.amount,
          payTo: config.x402.payTo,
          asset: config.x402.asset,
        },
      ],
    };

    res.writeHead(402, {
      'WWW-Authenticate': wwwAuth,
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(x402Body));
  };
}
