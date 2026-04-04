/**
 * SEP-7 — Stellar Payment URI builder.
 *
 * Generates `web+stellar:` URIs per SEP-0007 for requesting
 * XLM or custom asset payments on Stellar.
 *
 * @see https://github.com/nicohman/sep-0007
 *
 * @example
 * ```
 * web+stellar:pay?destination=GABCD...&amount=100&asset_code=USDC&asset_issuer=GA5Z...&memo=invoice123
 * ```
 */

export interface Sep7Options {
  /** Destination Stellar account ID. */
  destination: string;
  /** Amount to request (human-readable). */
  amount: string;
  /** Asset code: 'XLM' for native, or asset code like 'USDC'. Default: 'XLM'. */
  assetCode?: string;
  /** Asset issuer (required for non-native assets). */
  assetIssuer?: string;
  /** Optional memo to include. */
  memo?: string;
  /** Memo type: 'text', 'id', 'hash'. Default: 'text'. */
  memoType?: 'text' | 'id' | 'hash';
  /** Optional callback URL. */
  callback?: string;
  /** Optional message to display. */
  msg?: string;
  /** Network passphrase. Default: public network. */
  networkPassphrase?: string;
  /** Origin domain for signing requests. */
  originDomain?: string;
}

/**
 * Build a SEP-7 Stellar payment URI.
 *
 * @example
 * ```ts
 * // Native XLM
 * buildSep7Uri({ destination: 'GABCD...', amount: '100' });
 * // => 'web+stellar:pay?destination=GABCD...&amount=100'
 *
 * // USDC on Stellar
 * buildSep7Uri({
 *   destination: 'GABCD...',
 *   amount: '50',
 *   assetCode: 'USDC',
 *   assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
 *   memo: 'invoice-42',
 * });
 * ```
 */
export function buildSep7Uri(options: Sep7Options): string {
  const params = new URLSearchParams();

  params.set('destination', options.destination);
  params.set('amount', options.amount);

  const isNative = !options.assetCode || options.assetCode === 'XLM';

  if (!isNative) {
    params.set('asset_code', options.assetCode!);
    if (options.assetIssuer) {
      params.set('asset_issuer', options.assetIssuer);
    }
  }

  if (options.memo) {
    params.set('memo', options.memo);
    params.set('memo_type', options.memoType ?? 'MEMO_TEXT');
  }

  if (options.callback) params.set('callback', options.callback);
  if (options.msg) params.set('msg', options.msg);
  if (options.networkPassphrase) params.set('network_passphrase', options.networkPassphrase);
  if (options.originDomain) params.set('origin_domain', options.originDomain);

  return `web+stellar:pay?${params.toString()}`;
}
