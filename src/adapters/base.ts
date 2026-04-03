import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  type WalletClient,
  type PublicClient,
  type Chain,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';
import { PaymentAdapter } from './types';

export interface BaseAdapterOptions {
  /** Hex private key (0x-prefixed). If omitted, a random key is generated. */
  privateKey?: `0x${string}`;
  /** 'mainnet' or 'testnet' (default: 'testnet') */
  network?: 'mainnet' | 'testnet';
  /** Optional custom RPC URL */
  rpcUrl?: string;
}

/**
 * BasePaymentAdapter — On-chain settlement on Base (Coinbase L2).
 *
 * Uses viem for lightweight, type-safe EVM interactions.
 * Supports both Base Mainnet (eip155:8453) and Base Sepolia (eip155:84532).
 *
 * This is the recommended adapter for x402 protocol since Base is the
 * native chain for both x402 and USDC (Circle).
 *
 * @see https://base.org
 * @see https://x402.org
 */
export class BasePaymentAdapter implements PaymentAdapter {
  public readonly chainName = 'Base';
  public readonly caip2Id: string;

  private wallet: WalletClient;
  private publicClient: PublicClient;
  private account: ReturnType<typeof privateKeyToAccount>;
  private chain: Chain;

  constructor(options: BaseAdapterOptions = {}) {
    const key = options.privateKey ?? generatePrivateKey();
    this.account = privateKeyToAccount(key);
    this.chain = options.network === 'mainnet' ? base : baseSepolia;
    this.caip2Id = `eip155:${this.chain.id}`;

    const transport = options.rpcUrl ? http(options.rpcUrl) : http();

    this.wallet = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport,
    });

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport,
    });
  }

  getAddress(): string {
    return this.account.address;
  }

  async getBalance(): Promise<string> {
    const balance = await this.publicClient.getBalance({
      address: this.account.address,
    });
    return formatEther(balance);
  }

  async pay(
    destination: string,
    amount: string,
    network: string
  ): Promise<string | null> {
    try {
      const amountWei = BigInt(amount);
      const ethAmount = formatEther(amountWei);

      console.log(
        `[Base] 🚀 Building payment → ${destination.slice(0, 8)}…${destination.slice(-6)} ` +
          `(${ethAmount} ETH, ${this.chain.name})`
      );

      // Check balance
      const balance = await this.publicClient.getBalance({
        address: this.account.address,
      });

      if (balance < amountWei) {
        console.error(
          `[Base] ❌ Insufficient balance: ${formatEther(balance)} ETH < ${ethAmount} ETH`
        );
        return null;
      }

      console.log('[Base] 📡 Submitting transaction…');

      const hash = await this.wallet.sendTransaction({
        account: this.account,
        to: destination as `0x${string}`,
        value: amountWei,
        chain: this.chain,
      });

      console.log(`[Base] ✅ Confirmed — hash: ${hash}`);
      return hash;
    } catch (error: any) {
      console.error(`[Base] ❌ Transaction failed: ${error.message}`);
      return null;
    }
  }
}
