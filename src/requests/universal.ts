/**
 * Universal Payment URI builder — auto-detects chain and generates
 * the appropriate payment URI format.
 */
import { buildEip681Uri, type Eip681Options } from './eip681';
import { buildSep7Uri, type Sep7Options } from './sep7';
import { buildSolanaPayUri, type SolanaPayOptions } from './solana-pay';

export interface UniversalPaymentUriOptions {
  /** Target chain. */
  chain: 'evm' | 'stellar' | 'solana';
  /** Chain-specific options. */
  evm?: Eip681Options;
  stellar?: Sep7Options;
  solana?: SolanaPayOptions;
}

/**
 * Build a payment URI for any supported chain.
 *
 * @example
 * ```ts
 * const uri = buildPaymentUri({
 *   chain: 'evm',
 *   evm: { to: '0x...', amount: '0.5', chainId: 8453 },
 * });
 * ```
 */
export function buildPaymentUri(options: UniversalPaymentUriOptions): string {
  switch (options.chain) {
    case 'evm':
      if (!options.evm) throw new Error('EVM options required for chain=evm');
      return buildEip681Uri(options.evm);
    case 'stellar':
      if (!options.stellar) throw new Error('Stellar options required for chain=stellar');
      return buildSep7Uri(options.stellar);
    case 'solana':
      if (!options.solana) throw new Error('Solana options required for chain=solana');
      return buildSolanaPayUri(options.solana);
    default:
      throw new Error(`Unsupported chain: ${options.chain}`);
  }
}
