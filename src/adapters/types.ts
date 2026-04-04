/**
 * PaymentAdapter — generic interface for on-chain settlement.
 *
 * Adapters implement this interface to provide settlement on different
 * chains (Base, Stellar, Arbitrum, Solana, etc.) while the OwsClient
 * remains chain-agnostic.
 *
 * Pay Out methods (pay, getAddress) are required.
 * Pay In methods (watchIncoming, createPaymentRequest, getBalance) are optional
 * and enable bi-directional Agent-to-Agent commerce.
 *
 * @see OWS §07 — Supported Chains (CAIP-2 identifiers)
 */
export interface PaymentAdapter {
  // ═══ Pay Out (existing — unchanged) ═══════════════════════════════

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

  // ═══ Pay In (new — all optional for backward compat) ════════════

  /**
   * Watch for incoming payments to this adapter's address.
   * Returns an unsubscribe function to stop watching.
   */
  watchIncoming?(options: WatchOptions): Unsubscribe;

  /**
   * Create a payment request URI for this chain.
   * Used to generate EIP-681, SEP-7, Solana Pay URIs, etc.
   */
  createPaymentRequest?(options: PaymentRequestOptions): PaymentRequest | Promise<PaymentRequest>;

  /**
   * Get the current balance of this adapter's account.
   * Returns human-readable amount string.
   */
  getBalance?(): Promise<string>;
}

// ═══ Pay In Types ═══════════════════════════════════════════════════

/** Options for watching incoming payments. */
export interface WatchOptions {
  /** Asset to watch: 'USDC', 'native', or 'all'. Default: 'all' */
  asset?: string;
  /** Callback invoked on each incoming payment detected. */
  onPayment: (event: IncomingPayment) => void;
  /** Callback invoked on watcher errors. */
  onError?: (error: Error) => void;
}

/** Represents a detected incoming payment. */
export interface IncomingPayment {
  /** Amount in atomic units. */
  amount: string;
  /** Human-readable formatted amount. */
  amountFormatted: string;
  /** Asset identifier (e.g., 'USDC', 'ETH', 'XLM', 'SOL'). */
  asset: string;
  /** Sender address. */
  from: string;
  /** Transaction hash / ID. */
  transactionHash: string;
  /** Chain name. */
  chain: string;
  /** CAIP-2 chain identifier. */
  caip2Id: string;
  /** Timestamp of the payment. */
  timestamp: Date;
  /** Number of confirmations (if applicable). */
  confirmations?: number;
}

/** Options for creating a payment request. */
export interface PaymentRequestOptions {
  /** Human-readable amount to request. */
  amount: string;
  /** Asset to request: 'USDC' or 'native'. Default: 'native' */
  asset?: string;
  /** Optional memo / reference for the payment. */
  memo?: string;
  /** Expiration time in milliseconds from now. */
  expiresIn?: number;
}

/** A generated payment request. */
export interface PaymentRequest {
  /** Chain-specific payment URI (EIP-681, SEP-7, solana:..., etc.) */
  uri: string;
  /** Requested amount (human-readable). */
  amount: string;
  /** Requested asset. */
  asset: string;
  /** Optional memo included in the request. */
  memo?: string;
  /** When this request expires (if set). */
  expiresAt?: Date;
}

/** Function to unsubscribe from a watcher. */
export type Unsubscribe = () => void;

