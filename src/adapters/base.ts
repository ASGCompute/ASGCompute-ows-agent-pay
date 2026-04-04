import {
  createWalletClient,
  createPublicClient,
  http,
  formatEther,
  formatUnits,
  type WalletClient,
  type PublicClient,
  type Chain,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';
import { PaymentAdapter } from './types';
import { Logger, noopLogger } from '../logger';

/** ERC-20 transfer ABI — minimal, only what we need. */
const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'to', type: 'address' as const },
      { name: 'amount', type: 'uint256' as const },
    ],
    outputs: [{ name: '', type: 'bool' as const }],
  },
  {
    name: 'balanceOf',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [{ name: 'account', type: 'address' as const }],
    outputs: [{ name: '', type: 'uint256' as const }],
  },
] as const;

/** Known USDC contract addresses on Base networks. */
const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  // Base Mainnet
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  // Base Sepolia (Circle testnet USDC)
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

export interface BaseAdapterOptions {
  /** Hex private key (0x-prefixed). If omitted, a random key is generated. */
  privateKey?: `0x${string}`;
  /** 'mainnet' or 'testnet' (default: 'testnet') */
  network?: 'mainnet' | 'testnet';
  /** Optional custom RPC URL */
  rpcUrl?: string;
  /**
   * Asset to settle with.
   * - 'ETH' — native ETH transfer (default)
   * - 'USDC' — ERC-20 USDC transfer via Circle's official contract
   */
  asset?: 'ETH' | 'USDC';
  /** Optional logger. */
  logger?: Logger;
}

/**
 * BasePaymentAdapter — On-chain settlement on Base (Coinbase L2).
 *
 * Supports both native ETH transfers and USDC (ERC-20) transfers.
 * Uses viem for lightweight, type-safe EVM interactions.
 *
 * Networks:
 * - Base Mainnet (eip155:8453) — production
 * - Base Sepolia (eip155:84532) — testnet
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
  private asset: 'ETH' | 'USDC';
  private log: Logger;

  constructor(options: BaseAdapterOptions = {}) {
    const key = options.privateKey ?? generatePrivateKey();
    this.account = privateKeyToAccount(key);
    this.chain = options.network === 'mainnet' ? base : baseSepolia;
    this.caip2Id = `eip155:${this.chain.id}`;
    this.asset = options.asset ?? 'ETH';
    this.log = options.logger ?? noopLogger;

    const transport = options.rpcUrl ? http(options.rpcUrl) : http();

    this.wallet = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport,
    });

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport,
    }) as PublicClient;
  }

  getAddress(): string {
    return this.account.address;
  }

  /** Get native ETH balance (formatted). */
  async getBalance(): Promise<string> {
    const balance = await this.publicClient.getBalance({
      address: this.account.address,
    });
    return formatEther(balance);
  }

  /** Get USDC balance (formatted, 6 decimals). */
  async getUsdcBalance(): Promise<string> {
    const usdcAddress = USDC_ADDRESSES[this.chain.id];
    if (!usdcAddress) {
      return '0.00';
    }

    const balance = await this.publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_TRANSFER_ABI,
      functionName: 'balanceOf',
      args: [this.account.address],
    });

    return formatUnits(balance, 6);
  }

  async pay(
    destination: string,
    amount: string,
    network: string
  ): Promise<string | null> {
    if (this.asset === 'USDC') {
      return this.payUsdc(destination, amount);
    }
    return this.payEth(destination, amount);
  }

  /** Execute a native ETH transfer. */
  private async payEth(
    destination: string,
    amount: string
  ): Promise<string | null> {
    try {
      const amountWei = BigInt(amount);
      const ethAmount = formatEther(amountWei);

      this.log(
        `[Base/ETH] 🚀 ${ethAmount} ETH → ${destination.slice(0, 8)}…${destination.slice(-6)}`
      );

      // Check balance
      const balance = await this.publicClient.getBalance({
        address: this.account.address,
      });

      if (balance < amountWei) {
        this.log(
          `[Base/ETH] ❌ Insufficient: ${formatEther(balance)} < ${ethAmount} ETH`
        );
        return null;
      }

      const hash = await this.wallet.sendTransaction({
        account: this.account,
        to: destination as `0x${string}`,
        value: amountWei,
        chain: this.chain,
      });

      this.log(`[Base/ETH] ✅ ${hash}`);
      return hash;
    } catch (error: any) {
      this.log(`[Base/ETH] ❌ ${error.message}`);
      return null;
    }
  }

  /** Execute a USDC ERC-20 transfer. */
  private async payUsdc(
    destination: string,
    amount: string
  ): Promise<string | null> {
    try {
      const usdcAddress = USDC_ADDRESSES[this.chain.id];
      if (!usdcAddress) {
        this.log(`[Base/USDC] ❌ No USDC contract for chain ${this.chain.id}`);
        return null;
      }

      const amountAtomic = BigInt(amount);
      const usdcFormatted = formatUnits(amountAtomic, 6);

      this.log(
        `[Base/USDC] 🚀 ${usdcFormatted} USDC → ${destination.slice(0, 8)}…${destination.slice(-6)}`
      );

      // Check USDC balance
      const balance = await this.publicClient.readContract({
        address: usdcAddress,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'balanceOf',
        args: [this.account.address],
      });

      if (balance < amountAtomic) {
        this.log(
          `[Base/USDC] ❌ Insufficient: ${formatUnits(balance, 6)} < ${usdcFormatted} USDC`
        );
        return null;
      }

      // Execute ERC-20 transfer
      const hash = await this.wallet.writeContract({
        address: usdcAddress,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [destination as `0x${string}`, amountAtomic],
        chain: this.chain,
        account: this.account,
      });

      this.log(`[Base/USDC] ✅ ${hash}`);
      return hash;
    } catch (error: any) {
      this.log(`[Base/USDC] ❌ ${error.message}`);
      return null;
    }
  }
}
