/**
 * PaymentAdapter — generic interface for on-chain settlement.
 *
 * Adapters implement this interface to provide settlement on different
 * chains (Base, Stellar, Arbitrum, Solana, etc.) while the OwsClient
 * remains chain-agnostic.
 *
 * @see OWS §07 — Supported Chains (CAIP-2 identifiers)
 */
export interface PaymentAdapter {
  /**
   * Execute an on-chain payment.
   * @param destination - Recipient address (chain-native format)
   * @param amount      - Amount in atomic units (wei, stroops, lamports)
   * @param network     - Network identifier ('mainnet' | 'testnet' | CAIP-2 ID)
   * @returns Transaction hash on success, null on failure
   */
  pay(destination: string, amount: string, network: string): Promise<string | null>;

  /**
   * Get the public address of this adapter's signing account.
   */
  getAddress(): string;

  /**
   * Human-readable chain name for logging.
   */
  readonly chainName: string;

  /**
   * CAIP-2 chain identifier.
   * @example "eip155:8453" (Base Mainnet)
   * @example "eip155:84532" (Base Sepolia)
   * @example "stellar:pubnet"
   */
  readonly caip2Id: string;
}
