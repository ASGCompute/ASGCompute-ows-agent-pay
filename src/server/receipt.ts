/**
 * MPP Payment-Receipt builder.
 *
 * Generates base64url-encoded receipt JSON that can be attached
 * as a `Payment-Receipt` response header after successful payment verification.
 */

export interface ReceiptOptions {
  /** The challenge ID this receipt is for. */
  challengeId: string;
  /** Payment status. */
  status: 'settled' | 'pending' | 'failed';
  /** Amount paid (atomic units). */
  amount: string;
  /** Currency / asset. */
  asset: string;
  /** Transaction hash / proof. */
  transactionHash?: string;
  /** Timestamp of the receipt. */
  timestamp?: Date;
}

export interface PaymentReceipt {
  challengeId: string;
  status: 'settled' | 'pending' | 'failed';
  amount: string;
  asset: string;
  transactionHash?: string;
  issuedAt: string;
}

/**
 * Build a Payment-Receipt header value.
 *
 * @returns base64url-encoded JSON receipt.
 *
 * @example
 * ```ts
 * const receipt = buildReceipt({
 *   challengeId: 'ch_123',
 *   status: 'settled',
 *   amount: '500000',
 *   asset: 'USDC',
 *   transactionHash: '0xabc...',
 * });
 *
 * res.setHeader('Payment-Receipt', receipt);
 * ```
 */
export function buildReceipt(options: ReceiptOptions): string {
  const receipt: PaymentReceipt = {
    challengeId: options.challengeId,
    status: options.status,
    amount: options.amount,
    asset: options.asset,
    ...(options.transactionHash ? { transactionHash: options.transactionHash } : {}),
    issuedAt: (options.timestamp ?? new Date()).toISOString(),
  };

  return Buffer.from(JSON.stringify(receipt))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Parse a Payment-Receipt header value back into a receipt object.
 */
export function parseReceipt(encoded: string): PaymentReceipt {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = Buffer.from(padded, 'base64').toString('utf-8');
  return JSON.parse(decoded);
}
