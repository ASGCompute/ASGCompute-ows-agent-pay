import type { IncomingMessage, ServerResponse } from 'http';
import { Logger, noopLogger } from '../logger';

/**
 * Configuration for MPP payment gate middleware.
 */
export interface MppGateConfig {
  /** Realm identifier for the challenge (usually the API domain). */
  realm: string;
  /** Payment method: 'stripe', 'onchain', etc. */
  method: string;
  /** Intent: 'payment', 'subscription', etc. Default: 'payment'. */
  intent?: string;
  /** Amount to charge (as string, in smallest units). */
  amount: string;
  /** Currency code. Default: 'usd'. */
  currency?: string;
  /** Number of decimal places. Default: 2. */
  decimals?: number;
  /** Recipient address / account. */
  recipient: string;
  /** Challenge TTL in milliseconds. Default: 300000 (5 min). */
  ttlMs?: number;
  /** Verification function for the payment credential. */
  verifyCredential?: (credential: MppCredential, challengeId: string) => Promise<boolean> | boolean;
  /** Logger function. */
  logger?: Logger;
}

/** Decoded MPP credential from Authorization: Payment header. */
export interface MppCredential {
  challenge: {
    id: string;
    realm: string;
    method: string;
    intent: string;
    request: string;
    expires?: string;
  };
  source: string;
  payload: {
    transaction: string;
  };
}

/** Express/Connect request with optional MPP payment metadata. */
interface MppGatedRequest extends IncomingMessage {
  mppPayment?: MppCredential;
}

let challengeCounter = 0;

/**
 * Generate a unique challenge ID.
 */
function generateChallengeId(): string {
  challengeCounter++;
  return `ch_${Date.now()}_${challengeCounter}`;
}

/**
 * Creates an Express/Connect middleware that gates access behind MPP payments.
 *
 * When a request lacks a valid `Authorization: Payment` header, the middleware
 * responds with 402 and a `WWW-Authenticate: Payment` challenge header.
 *
 * @example
 * ```ts
 * app.post('/api/premium', createMppGate({
 *   realm: 'api.example.com',
 *   method: 'stripe',
 *   amount: '50',
 *   currency: 'usd',
 *   recipient: 'acct_xxx',
 * }), handler);
 * ```
 */
export function createMppGate(config: MppGateConfig) {
  const log = config.logger ?? noopLogger;
  const intent = config.intent ?? 'payment';
  const currency = config.currency ?? 'usd';
  const decimals = config.decimals ?? 2;
  const ttlMs = config.ttlMs ?? 300000;

  return async (
    req: MppGatedRequest,
    res: ServerResponse,
    next: (err?: any) => void
  ) => {
    // Check for Authorization: Payment header
    const authHeader = req.headers['authorization'] as string | undefined;

    if (!authHeader || !authHeader.startsWith('Payment ')) {
      // No credential — return 402 with WWW-Authenticate challenge
      log('[mpp-gate] 💰 No Authorization: Payment — returning 402 challenge');

      const challengeId = generateChallengeId();
      const expires = new Date(Date.now() + ttlMs).toISOString();

      const requestObj = {
        amount: config.amount,
        currency,
        decimals,
        recipient: config.recipient,
      };

      const requestEncoded = Buffer.from(JSON.stringify(requestObj))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const challengeStr = `Payment id="${challengeId}",realm="${config.realm}",method="${config.method}",intent="${intent}",request="${requestEncoded}",expires="${expires}"`;

      res.writeHead(402, {
        'WWW-Authenticate': challengeStr,
        'Content-Type': 'text/plain',
      });
      res.end('Payment Required');
      return;
    }

    // Decode Payment credential
    try {
      const credentialBase64 = authHeader.slice('Payment '.length);
      // Re-add base64 padding
      const padded = credentialBase64
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const decoded = Buffer.from(padded, 'base64').toString('utf-8');
      const credential: MppCredential = JSON.parse(decoded);

      // Validate credential structure
      if (!credential.challenge?.id || !credential.payload?.transaction) {
        log('[mpp-gate] ❌ Malformed credential');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed payment credential' }));
        return;
      }

      // Check realm matches
      if (credential.challenge.realm !== config.realm) {
        log('[mpp-gate] ❌ Realm mismatch');
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Challenge realm mismatch' }));
        return;
      }

      // Check expiration
      if (credential.challenge.expires) {
        const expiresAt = new Date(credential.challenge.expires).getTime();
        if (Date.now() > expiresAt) {
          log('[mpp-gate] ❌ Challenge expired');
          res.writeHead(402, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Challenge expired' }));
          return;
        }
      }

      // Custom verification
      if (config.verifyCredential) {
        const isValid = await config.verifyCredential(credential, credential.challenge.id);
        if (!isValid) {
          log('[mpp-gate] ❌ Credential verification failed');
          res.writeHead(402, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payment verification failed' }));
          return;
        }
      }

      // Attach credential to request
      req.mppPayment = credential;
      log(`[mpp-gate] ✅ Payment verified: tx=${credential.payload.transaction.slice(0, 16)}…`);
      next();
    } catch (err: any) {
      log(`[mpp-gate] ❌ Failed to decode credential: ${err.message}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid Authorization: Payment header' }));
    }
  };
}
