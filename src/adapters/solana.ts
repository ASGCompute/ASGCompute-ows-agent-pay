import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getMint,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { PaymentAdapter } from './types';
import { Logger, noopLogger } from '../logger';

// ─── USDC Mint Addresses ────────────────────────────────────────────

/** Circle's official USDC on Solana mainnet. */
const USDC_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

/** Circle's USDC on Solana devnet (for testing). */
const USDC_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

// ─── Adapter Options ────────────────────────────────────────────────

export interface SolanaAdapterOptions {
  /**
   * Solana secret key as a Uint8Array (64 bytes) or base58 string.
   * If omitted, a random keypair is generated (useful for receiving-only agents).
   */
  secretKey?: Uint8Array | number[];
  /**
   * Network: 'mainnet-beta' | 'devnet' | 'testnet'
   * @default 'devnet'
   */
  network?: 'mainnet-beta' | 'devnet' | 'testnet';
  /**
   * Asset to settle with.
   * - 'SOL' — native SOL (default)
   * - 'USDC' — Circle's native USDC (SPL token)
   * @default 'SOL'
   */
  asset?: 'SOL' | 'USDC';
  /** Optional custom RPC URL. Uses Solana public RPC if omitted. */
  rpcUrl?: string;
  /** Optional logger. SDK is silent by default. */
  logger?: Logger;
}

// ─── Solana Payment Adapter ─────────────────────────────────────────

/**
 * SolanaPaymentAdapter — On-chain settlement on Solana.
 *
 * Supports:
 * - Native SOL transfers (System Program)
 * - USDC (SPL Token) transfers with automatic ATA creation
 *
 * @example
 * ```ts
 * // SOL on devnet
 * const adapter = new SolanaPaymentAdapter({
 *   secretKey: myKeypair.secretKey,
 *   network: 'devnet',
 *   asset: 'SOL',
 *   logger: console.log,
 * });
 *
 * // USDC on mainnet
 * const adapter = new SolanaPaymentAdapter({
 *   secretKey: myKeypair.secretKey,
 *   network: 'mainnet-beta',
 *   asset: 'USDC',
 * });
 * ```
 *
 * @see https://spl.solana.com/token — SPL Token program
 * @see https://pay.asgcard.dev — ASG Pay production infrastructure
 */
export class SolanaPaymentAdapter implements PaymentAdapter {
  public readonly chainName: string;
  public readonly caip2Id: string;

  private connection: Connection;
  private keypair: Keypair;
  private asset: 'SOL' | 'USDC';
  private usdcMint: PublicKey;
  private network: 'mainnet-beta' | 'devnet' | 'testnet';
  private log: Logger;

  constructor(options: SolanaAdapterOptions) {
    this.network = options.network ?? 'devnet';
    this.asset = options.asset ?? 'SOL';
    this.log = options.logger ?? noopLogger;

    // Set CAIP-2 ID
    const chainRef = this.network === 'mainnet-beta' ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' : '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z';
    this.caip2Id = `solana:${chainRef}`;
    this.chainName = `Solana ${this.network === 'mainnet-beta' ? 'Mainnet' : this.network === 'devnet' ? 'Devnet' : 'Testnet'}`;

    // USDC mint per network
    this.usdcMint = this.network === 'mainnet-beta' ? USDC_MAINNET : USDC_DEVNET;

    // Connection
    const rpcUrl = options.rpcUrl ?? clusterApiUrl(this.network);
    this.connection = new Connection(rpcUrl, 'confirmed');

    // Keypair
    if (options.secretKey) {
      const keyArray = options.secretKey instanceof Uint8Array
        ? options.secretKey
        : Uint8Array.from(options.secretKey);
      this.keypair = Keypair.fromSecretKey(keyArray);
    } else {
      this.keypair = Keypair.generate();
    }
  }

  getAddress(): string {
    return this.keypair.publicKey.toBase58();
  }

  /** Get SOL balance in SOL (not lamports). */
  async getSolBalance(): Promise<string> {
    const lamports = await this.connection.getBalance(this.keypair.publicKey);
    return (lamports / LAMPORTS_PER_SOL).toFixed(9);
  }

  /** Get USDC balance (6 decimals). */
  async getUsdcBalance(): Promise<string> {
    try {
      const ata = await this.findAta(this.keypair.publicKey);
      if (!ata) return '0.000000';
      const account = await getAccount(this.connection, ata);
      return (Number(account.amount) / 1e6).toFixed(6);
    } catch {
      return '0.000000';
    }
  }

  async pay(
    destination: string,
    amount: string,
    network: string
  ): Promise<string | null> {
    if (this.asset === 'USDC') {
      return this.payUsdc(destination, amount);
    }
    return this.paySol(destination, amount);
  }

  // ── Native SOL transfer ─────────────────────────────────────────

  private async paySol(
    destination: string,
    amount: string
  ): Promise<string | null> {
    const tag = `[Solana/SOL]`;
    try {
      const lamports = BigInt(amount);
      const solAmount = (Number(lamports) / LAMPORTS_PER_SOL).toFixed(9);
      const destPubkey = new PublicKey(destination);

      this.log(`${tag} 🚀 ${solAmount} SOL → ${destination.slice(0, 8)}…`);

      // Balance check
      const balance = await this.connection.getBalance(this.keypair.publicKey);
      if (BigInt(balance) < lamports) {
        this.log(`${tag} ❌ Insufficient: ${(balance / LAMPORTS_PER_SOL).toFixed(9)} < ${solAmount} SOL`);
        return null;
      }

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.keypair.publicKey,
          toPubkey: destPubkey,
          lamports: lamports,
        })
      );

      const signature = await this.connection.sendTransaction(tx, [this.keypair]);
      await this.connection.confirmTransaction(signature, 'confirmed');

      this.log(`${tag} ✅ ${signature}`);
      return signature;
    } catch (error: any) {
      this.log(`${tag} ❌ ${error.message}`);
      return null;
    }
  }

  // ── USDC SPL Token transfer ─────────────────────────────────────

  private async payUsdc(
    destination: string,
    amount: string
  ): Promise<string | null> {
    const tag = `[Solana/USDC]`;
    try {
      const atomicAmount = BigInt(amount);
      const formatted = (Number(atomicAmount) / 1e6).toFixed(6);
      const destPubkey = new PublicKey(destination);

      this.log(`${tag} 🚀 ${formatted} USDC → ${destination.slice(0, 8)}…`);

      // Get or create sender's ATA
      const senderAta = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.keypair,        // payer
        this.usdcMint,       // mint
        this.keypair.publicKey // owner
      );

      // Balance check
      if (senderAta.amount < atomicAmount) {
        this.log(`${tag} ❌ Insufficient: ${(Number(senderAta.amount) / 1e6).toFixed(6)} < ${formatted} USDC`);
        return null;
      }

      // Get or create destination ATA
      const destAta = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.keypair,   // payer (creates ATA if needed)
        this.usdcMint,  // mint
        destPubkey       // owner
      );

      // Build transfer instruction
      const tx = new Transaction().add(
        createTransferInstruction(
          senderAta.address,    // source
          destAta.address,      // destination
          this.keypair.publicKey, // authority
          atomicAmount,          // amount
          [],                    // multiSigners
          TOKEN_PROGRAM_ID
        )
      );

      const signature = await this.connection.sendTransaction(tx, [this.keypair]);
      await this.connection.confirmTransaction(signature, 'confirmed');

      this.log(`${tag} ✅ ${signature}`);
      return signature;
    } catch (error: any) {
      this.log(`${tag} ❌ ${error.message}`);
      return null;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /** Find the Associated Token Account for USDC. Returns null if none. */
  private async findAta(owner: PublicKey): Promise<PublicKey | null> {
    try {
      const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
      // Compute the ATA deterministically
      const [ata] = PublicKey.findProgramAddressSync(
        [
          owner.toBuffer(),
          TOKEN_PROGRAM_ID.toBuffer(),
          this.usdcMint.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      // Check if it exists
      const info = await this.connection.getAccountInfo(ata);
      return info ? ata : null;
    } catch {
      return null;
    }
  }

  /** Request SOL airdrop from devnet/testnet faucet (for testing). */
  async requestAirdrop(amountSol: number = 1): Promise<string | null> {
    if (this.network === 'mainnet-beta') {
      this.log('[Solana] ❌ Cannot airdrop on mainnet');
      return null;
    }
    try {
      const lamports = amountSol * LAMPORTS_PER_SOL;
      this.log(`[Solana] 💧 Requesting ${amountSol} SOL airdrop…`);
      const sig = await this.connection.requestAirdrop(this.keypair.publicKey, lamports);
      await this.connection.confirmTransaction(sig, 'confirmed');
      this.log(`[Solana] ✅ Airdrop: ${sig}`);
      return sig;
    } catch (error: any) {
      this.log(`[Solana] ❌ Airdrop failed: ${error.message}`);
      return null;
    }
  }
}
