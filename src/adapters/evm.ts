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
import {
  base,
  baseSepolia,
  arbitrum,
  arbitrumSepolia,
  optimism,
  optimismSepolia,
  mainnet as ethereum,
  sepolia as ethereumSepolia,
  polygon,
  polygonAmoy,
} from 'viem/chains';
import { PaymentAdapter } from './types';
import { Logger, noopLogger } from '../logger';

// ─── Supported Chains Registry ──────────────────────────────────────

/** All EVM chains supported by @asgcard/pay. */
export type EvmChainName =
  | 'base'
  | 'base-sepolia'
  | 'arbitrum'
  | 'arbitrum-sepolia'
  | 'optimism'
  | 'optimism-sepolia'
  | 'ethereum'
  | 'ethereum-sepolia'
  | 'polygon'
  | 'polygon-amoy';

interface ChainConfig {
  chain: Chain;
  displayName: string;
  /** Circle USDC contract (null if no official USDC on this network). */
  usdc: `0x${string}` | null;
}

/**
 * Chain registry — maps chain names to viem chain objects + USDC contracts.
 * All USDC addresses are Circle's official native USDC deployments.
 */
const CHAIN_REGISTRY: Record<EvmChainName, ChainConfig> = {
  // ── Base (Coinbase L2) ──────────────────────────────────────────
  'base': {
    chain: base,
    displayName: 'Base',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  'base-sepolia': {
    chain: baseSepolia,
    displayName: 'Base Sepolia',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },

  // ── Arbitrum ────────────────────────────────────────────────────
  'arbitrum': {
    chain: arbitrum,
    displayName: 'Arbitrum One',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  'arbitrum-sepolia': {
    chain: arbitrumSepolia,
    displayName: 'Arbitrum Sepolia',
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  },

  // ── Optimism ────────────────────────────────────────────────────
  'optimism': {
    chain: optimism,
    displayName: 'Optimism',
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  },
  'optimism-sepolia': {
    chain: optimismSepolia,
    displayName: 'Optimism Sepolia',
    usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
  },

  // ── Ethereum ────────────────────────────────────────────────────
  'ethereum': {
    chain: ethereum,
    displayName: 'Ethereum',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  'ethereum-sepolia': {
    chain: ethereumSepolia,
    displayName: 'Ethereum Sepolia',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },

  // ── Polygon ─────────────────────────────────────────────────────
  'polygon': {
    chain: polygon,
    displayName: 'Polygon',
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  },
  'polygon-amoy': {
    chain: polygonAmoy,
    displayName: 'Polygon Amoy',
    usdc: null, // No official Circle testnet USDC on Amoy yet
  },
};

// ─── ERC-20 ABI (minimal) ───────────────────────────────────────────

const ERC20_ABI = [
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

// ─── Adapter Options ────────────────────────────────────────────────

export interface EvmAdapterOptions {
  /**
   * Chain to settle on.
   * @example 'base', 'arbitrum', 'optimism', 'ethereum', 'polygon'
   * @example 'base-sepolia', 'arbitrum-sepolia' (testnets)
   */
  chain: EvmChainName;
  /**
   * Asset to settle with.
   * - 'native' — chain's native token (ETH on L1/L2, MATIC on Polygon)
   * - 'USDC' — Circle's native USDC (ERC-20)
   * @default 'native'
   */
  asset?: 'native' | 'USDC';
  /** Hex private key (0x-prefixed). If omitted, a random key is generated. */
  privateKey?: `0x${string}`;
  /** Optional custom RPC URL. Uses viem's default public RPCs if omitted. */
  rpcUrl?: string;
  /** Optional logger. SDK is silent by default. */
  logger?: Logger;
}

// ─── Universal EVM Adapter ──────────────────────────────────────────

/**
 * EvmPaymentAdapter — Universal EVM on-chain settlement.
 *
 * One adapter for ALL EVM chains supported by x402:
 * Base, Arbitrum, Optimism, Ethereum, Polygon — mainnet & testnet.
 *
 * Supports native token (ETH/MATIC) and USDC (Circle ERC-20) transfers.
 *
 * @example
 * ```ts
 * // Arbitrum USDC settlement
 * const adapter = new EvmPaymentAdapter({
 *   chain: 'arbitrum',
 *   asset: 'USDC',
 *   privateKey: '0x...',
 * });
 *
 * // Base ETH settlement (testnet)
 * const adapter = new EvmPaymentAdapter({
 *   chain: 'base-sepolia',
 *   asset: 'native',
 * });
 * ```
 *
 * @see https://x402.org — x402 payment protocol
 * @see https://pay.asgcard.dev — ASG Pay production infrastructure
 */
export class EvmPaymentAdapter implements PaymentAdapter {
  public readonly chainName: string;
  public readonly caip2Id: string;

  private wallet: WalletClient;
  private publicClient: PublicClient;
  private account: ReturnType<typeof privateKeyToAccount>;
  private chainConfig: ChainConfig;
  private asset: 'native' | 'USDC';
  private log: Logger;

  constructor(options: EvmAdapterOptions) {
    const config = CHAIN_REGISTRY[options.chain];
    if (!config) {
      throw new Error(
        `Unsupported chain: "${options.chain}". ` +
        `Supported: ${Object.keys(CHAIN_REGISTRY).join(', ')}`
      );
    }

    this.chainConfig = config;
    this.chainName = config.displayName;
    this.caip2Id = `eip155:${config.chain.id}`;
    this.asset = options.asset ?? 'native';
    this.log = options.logger ?? noopLogger;

    if (this.asset === 'USDC' && !config.usdc) {
      throw new Error(
        `No USDC contract available for ${config.displayName}. ` +
        `Use asset: 'native' or choose a chain with USDC support.`
      );
    }

    const key = options.privateKey ?? generatePrivateKey();
    this.account = privateKeyToAccount(key);

    const transport = options.rpcUrl ? http(options.rpcUrl) : http();

    this.wallet = createWalletClient({
      account: this.account,
      chain: config.chain,
      transport,
    });

    this.publicClient = createPublicClient({
      chain: config.chain,
      transport,
    }) as PublicClient;
  }

  getAddress(): string {
    return this.account.address;
  }

  /** Get native token balance (ETH, MATIC, etc.). */
  async getNativeBalance(): Promise<string> {
    const balance = await this.publicClient.getBalance({
      address: this.account.address,
    });
    return formatEther(balance);
  }

  /** Get USDC balance (6 decimals). Returns '0.00' if USDC not supported. */
  async getUsdcBalance(): Promise<string> {
    const usdcAddress = this.chainConfig.usdc;
    if (!usdcAddress) return '0.00';

    const balance = await this.publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
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
    return this.payNative(destination, amount);
  }

  // ── Native token transfer ───────────────────────────────────────

  private async payNative(
    destination: string,
    amount: string
  ): Promise<string | null> {
    const tag = `[${this.chainName}/native]`;
    try {
      const amountWei = BigInt(amount);
      const formatted = formatEther(amountWei);

      this.log(`${tag} 🚀 ${formatted} → ${this.shortAddr(destination)}`);

      const balance = await this.publicClient.getBalance({
        address: this.account.address,
      });

      if (balance < amountWei) {
        this.log(`${tag} ❌ Insufficient: ${formatEther(balance)} < ${formatted}`);
        return null;
      }

      const hash = await this.wallet.sendTransaction({
        account: this.account,
        to: destination as `0x${string}`,
        value: amountWei,
        chain: this.chainConfig.chain,
      });

      this.log(`${tag} ✅ ${hash}`);
      return hash;
    } catch (error: any) {
      this.log(`${tag} ❌ ${error.message}`);
      return null;
    }
  }

  // ── USDC ERC-20 transfer ────────────────────────────────────────

  private async payUsdc(
    destination: string,
    amount: string
  ): Promise<string | null> {
    const tag = `[${this.chainName}/USDC]`;
    const usdcAddress = this.chainConfig.usdc!;

    try {
      const amountAtomic = BigInt(amount);
      const formatted = formatUnits(amountAtomic, 6);

      this.log(`${tag} 🚀 ${formatted} USDC → ${this.shortAddr(destination)}`);

      // Balance check
      const balance = await this.publicClient.readContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [this.account.address],
      });

      if (balance < amountAtomic) {
        this.log(`${tag} ❌ Insufficient: ${formatUnits(balance, 6)} < ${formatted} USDC`);
        return null;
      }

      const hash = await this.wallet.writeContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [destination as `0x${string}`, amountAtomic],
        chain: this.chainConfig.chain,
        account: this.account,
      });

      this.log(`${tag} ✅ ${hash}`);
      return hash;
    } catch (error: any) {
      this.log(`${tag} ❌ ${error.message}`);
      return null;
    }
  }

  private shortAddr(addr: string): string {
    return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
  }
}

// ─── Helper: list all supported chains ──────────────────────────────

/** Returns metadata for all supported EVM chains. */
export function listEvmChains(): Array<{
  name: EvmChainName;
  displayName: string;
  chainId: number;
  caip2Id: string;
  hasUsdc: boolean;
}> {
  return Object.entries(CHAIN_REGISTRY).map(([name, config]) => ({
    name: name as EvmChainName,
    displayName: config.displayName,
    chainId: config.chain.id,
    caip2Id: `eip155:${config.chain.id}`,
    hasUsdc: config.usdc !== null,
  }));
}
