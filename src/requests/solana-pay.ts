/**
 * Solana Pay — Payment URI builder.
 *
 * Generates `solana:` URIs per the Solana Pay specification
 * for requesting SOL or SPL token payments.
 *
 * @see https://docs.solanapay.com/spec
 *
 * @example
 * ```
 * solana:7abc...?amount=1.5&spl-token=EPjFW...&reference=ref123&label=MyStore&message=Order42
 * ```
 */

export interface SolanaPayOptions {
  /** Recipient wallet address (base58). */
  recipient: string;
  /** Amount to request (human-readable). */
  amount: string;
  /** SPL token mint address. If omitted, requests native SOL. */
  splToken?: string;
  /** Unique reference for tracking the payment (base58 public key). */
  reference?: string;
  /** Label for the recipient. */
  label?: string;
  /** Message to display to the payer. */
  message?: string;
  /** Optional memo to include in the transaction. */
  memo?: string;
}

/**
 * Build a Solana Pay payment URI.
 *
 * @example
 * ```ts
 * // Native SOL
 * buildSolanaPayUri({ recipient: '7abc...', amount: '1.5' });
 * // => 'solana:7abc...?amount=1.5'
 *
 * // USDC SPL token
 * buildSolanaPayUri({
 *   recipient: '7abc...',
 *   amount: '25.00',
 *   splToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
 *   label: 'ASG Pay',
 *   message: 'Agent service payment',
 * });
 * ```
 */
export function buildSolanaPayUri(options: SolanaPayOptions): string {
  const params = new URLSearchParams();

  params.set('amount', options.amount);

  if (options.splToken) params.set('spl-token', options.splToken);
  if (options.reference) params.set('reference', options.reference);
  if (options.label) params.set('label', options.label);
  if (options.message) params.set('message', options.message);
  if (options.memo) params.set('memo', options.memo);

  return `solana:${options.recipient}?${params.toString()}`;
}
