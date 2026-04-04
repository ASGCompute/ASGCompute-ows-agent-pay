import type { IncomingMessage, ServerResponse } from 'http';
import { Logger, noopLogger } from '../logger';

/**
 * Configuration for x402 payment gate middleware.
 */
export interface X402GateConfig {
  /** Wallet address to receive payments. */
  payTo: string;
  /** Amount in atomic units (e.g., '500000' = 0.50 USDC). */
  amount: string;
  /** Asset identifier: 'USDC', 'ETH', etc. */
  asset: string;
  /** Network / CAIP-2 identifier. */
  network: string;
  /** Payment scheme. Default: 'exact'. */
  scheme?: string;
  /** x402 version. Default: 2. */
  x402Version?: number;
  /** Resource description for human-readable display. */
  description?: string;
  /** USD amount for policy engines (optional). */
  usdAmount?: number;
  /** Facilitator URL for verification (optional). */
  facilitatorUrl?: string;
  /** Verification function. If provided, called to verify X-PAYMENT proof. */
  verifyPayment?: (proof: X402Proof) => Promise<boolean> | boolean;
  /** Logger function. */
  logger?: Logger;
}

/** Decoded X-PAYMENT proof from client. */
export interface X402Proof {
  x402Version: number;
  accepted: {
    scheme: string;
    network: string;
    amount: string;
    payTo: string;
    asset: string;
  };
  payload: {
    transaction: string;
    chain: string;
  };
}

/** Express/Connect-style request with optional payment metadata. */
interface GatedRequest extends IncomingMessage {
  payment?: X402Proof;
}

/**
 * Creates an Express/Connect middleware that gates access behind x402 payments.
 *
 * When a request lacks a valid `X-PAYMENT` header, the middleware responds with
 * 402 Payment Required and an x402-compliant JSON challenge body.
 *
 * When a valid `X-PAYMENT` header is present, it's decoded and optionally
 * verified before calling `next()`.
 *
 * @example
 * ```ts
 * app.post('/api/premium', createX402Gate({
 *   payTo: '0xABC...',
 *   amount: '500000',
 *   asset: 'USDC',
 *   network: 'eip155:8453',
 * }), handler);
 * ```
 */
export function createX402Gate(config: X402GateConfig) {
  const log = config.logger ?? noopLogger;
  const version = config.x402Version ?? 2;
  const scheme = config.scheme ?? 'exact';

  return async (
    req: GatedRequest,
    res: ServerResponse,
    next: (err?: any) => void
  ) => {
    // Check for existing X-PAYMENT header
    const paymentHeader =
      (req.headers['x-payment'] as string) ||
      (req.headers['X-PAYMENT'] as string);

    if (!paymentHeader) {
      // No payment proof — return 402 challenge
      log('[x402-gate] 💰 No X-PAYMENT header — returning 402 challenge');

      const challenge = {
        x402Version: version,
        resource: {
          url: req.url || '/',
          description: config.description || 'Payment required',
          ...(config.usdAmount ? { usdAmount: config.usdAmount } : {}),
        },
        accepts: [
          {
            scheme,
            network: config.network,
            amount: config.amount,
            payTo: config.payTo,
            asset: config.asset,
          },
        ],
      };

      res.writeHead(402, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(challenge));
      return;
    }

    // Decode X-PAYMENT proof
    try {
      const decoded = Buffer.from(paymentHeader, 'base64').toString('utf-8');
      const proof: X402Proof = JSON.parse(decoded);

      // Basic validation
      if (!proof.payload?.transaction) {
        log('[x402-gate] ❌ Missing transaction in payment proof');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid payment proof: missing transaction' }));
        return;
      }

      // Verify payment destination matches
      if (proof.accepted?.payTo && proof.accepted.payTo !== config.payTo) {
        log('[x402-gate] ❌ Payment destination mismatch');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payment destination mismatch' }));
        return;
      }

      // Verify amount matches
      if (proof.accepted?.amount && proof.accepted.amount !== config.amount) {
        log('[x402-gate] ❌ Payment amount mismatch');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payment amount mismatch' }));
        return;
      }

      // Custom verification (if provided)
      if (config.verifyPayment) {
        const isValid = await config.verifyPayment(proof);
        if (!isValid) {
          log('[x402-gate] ❌ Custom verification failed');
          res.writeHead(402, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payment verification failed' }));
          return;
        }
      }

      // Attach proof to request for downstream handlers
      req.payment = proof;
      log(`[x402-gate] ✅ Payment verified: tx=${proof.payload.transaction.slice(0, 16)}…`);
      next();
    } catch (err: any) {
      log(`[x402-gate] ❌ Failed to decode payment proof: ${err.message}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid X-PAYMENT header' }));
    }
  };
}
