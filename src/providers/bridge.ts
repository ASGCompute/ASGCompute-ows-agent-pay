/**
 * Cross-Chain Bridge Module for ASG Pay
 *
 * Provides cross-chain token transfers between any supported EVM chain
 * using the OnchainOS DEX cross-chain API.
 *
 * Strategies:
 * 1. OnchainOS Cross-Chain — single-tx bridge via OKX aggregated bridges
 *    (Stargate, Across, Celer, etc.)
 * 2. Two-Step — swap to bridgeable token on source → bridge → swap on dest
 *
 * @example
 * ```ts
 * const bridge = new CrossChainBridge({ provider: okxProvider });
 *
 * // Get quote: Base USDC → X Layer USDC
 * const quote = await bridge.getQuote({
 *   fromChainIndex: '8453',
 *   toChainIndex: '196',
 *   fromTokenAddress: USDC_BASE,
 *   toTokenAddress: USDC_XLAYER,
 *   amount: '1000000', // 1 USDC
 * });
 *
 * // Execute bridge (requires signer)
 * const result = await bridge.execute(quote, walletClient);
 * ```
 */

import { type OnchainOSProvider } from './onchainos';
import { Logger, noopLogger } from '../logger';

// ─── Types ──────────────────────────────────────────────────────────

export interface BridgeQuoteParams {
  /** Source chain index (e.g. '8453' for Base). */
  fromChainIndex: string;
  /** Destination chain index (e.g. '196' for X Layer). */
  toChainIndex: string;
  /** Source token contract address. Use 0xEeEe...EEeE for native. */
  fromTokenAddress: string;
  /** Destination token contract address. Use 0xEeEe...EEeE for native. */
  toTokenAddress: string;
  /** Amount in smallest unit (e.g. '1000000' for 1 USDC). */
  amount: string;
  /** Slippage tolerance percentage (default: '1'). */
  slippagePercent?: string;
  /** User wallet address (required for buildTx). */
  userWalletAddress?: string;
}

export interface BridgeQuoteResult {
  /** Bridge route information. */
  route: BridgeRoute;
  /** Estimated output amount in smallest unit. */
  toTokenAmount: string;
  /** Source token info. */
  fromToken: { symbol: string; decimals: number; address: string };
  /** Destination token info. */
  toToken: { symbol: string; decimals: number; address: string };
  /** Estimated bridge fee in USD. */
  estimatedFeeUsd: string;
  /** Estimated time in seconds. */
  estimatedTimeSeconds: number;
  /** Minimum received after slippage. */
  minReceiveAmount: string;
  /** Ready-to-sign transaction data (if userWalletAddress provided). */
  tx?: BridgeTxData;
}

export interface BridgeRoute {
  /** Bridge/DEX protocol used. */
  bridgeName: string;
  /** Steps in the route. */
  steps: BridgeStep[];
  /** Total route: source → dest description. */
  description: string;
}

export interface BridgeStep {
  type: 'swap' | 'bridge' | 'approve';
  chainIndex: string;
  protocol: string;
  fromToken: string;
  toToken: string;
  amount: string;
}

export interface BridgeTxData {
  from: string;
  to: string;
  data: string;
  value: string;
  gas: string;
  gasPrice: string;
  chainId: string;
}

export interface BridgeStatus {
  status: 'pending' | 'source_confirmed' | 'bridging' | 'completed' | 'failed';
  sourceTxHash?: string;
  destTxHash?: string;
  bridgeName?: string;
  estimatedRemainingSeconds?: number;
}

// ─── Chain Constants ────────────────────────────────────────────────

const CHAIN_INFO: Record<string, { name: string; nativeSymbol: string; nativeAddress: string }> = {
  '1': { name: 'Ethereum', nativeSymbol: 'ETH', nativeAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
  '137': { name: 'Polygon', nativeSymbol: 'MATIC', nativeAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
  '42161': { name: 'Arbitrum', nativeSymbol: 'ETH', nativeAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
  '10': { name: 'Optimism', nativeSymbol: 'ETH', nativeAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
  '8453': { name: 'Base', nativeSymbol: 'ETH', nativeAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
  '196': { name: 'X Layer', nativeSymbol: 'OKB', nativeAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
  '56': { name: 'BNB Chain', nativeSymbol: 'BNB', nativeAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
  '43114': { name: 'Avalanche', nativeSymbol: 'AVAX', nativeAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
  '501': { name: 'Solana', nativeSymbol: 'SOL', nativeAddress: '11111111111111111111111111111111' },
};

/** USDC addresses on chains where we support bridging. */
const USDC_ADDRESSES: Record<string, string> = {
  '1': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  '137': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  '42161': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  '10': '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  '8453': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  '196': '0x74b7f16337b8972027f6196a17a631ac6de26d22',
};

// ─── CrossChainBridge ───────────────────────────────────────────────

export interface CrossChainBridgeConfig {
  /** OnchainOS provider for DEX quotes and cross-chain API. */
  provider: OnchainOSProvider;
  /** Logger function. */
  logger?: Logger;
}

export class CrossChainBridge {
  private readonly provider: OnchainOSProvider;
  private readonly logger: Logger;

  constructor(config: CrossChainBridgeConfig) {
    this.provider = config.provider;
    this.logger = config.logger ?? noopLogger;
  }

  // ── Supported Routes ────────────────────────────────────────────

  /** Get all chains supported for cross-chain bridging. */
  getSupportedChains(): Array<{ chainIndex: string; name: string; nativeSymbol: string; hasUsdc: boolean }> {
    return Object.entries(CHAIN_INFO).map(([chainIndex, info]) => ({
      chainIndex,
      name: info.name,
      nativeSymbol: info.nativeSymbol,
      hasUsdc: chainIndex in USDC_ADDRESSES,
    }));
  }

  /** Get USDC address on a given chain, or null if not supported. */
  getUsdcAddress(chainIndex: string): string | null {
    return USDC_ADDRESSES[chainIndex] ?? null;
  }

  /** Check if a route is supported (both chains must be in our registry). */
  isRouteSupported(fromChainIndex: string, toChainIndex: string): boolean {
    return fromChainIndex in CHAIN_INFO && toChainIndex in CHAIN_INFO && fromChainIndex !== toChainIndex;
  }

  // ── Quote ──────────────────────────────────────────────────────

  /**
   * Get a bridge quote for cross-chain transfer.
   *
   * Strategy:
   * 1. Try OnchainOS cross-chain API (aggregated bridges)
   * 2. If unavailable, compute a two-step route:
   *    Source chain DEX swap → Bridge via USDC → Dest chain DEX swap
   */
  async getQuote(params: BridgeQuoteParams): Promise<BridgeQuoteResult> {
    if (!this.isRouteSupported(params.fromChainIndex, params.toChainIndex)) {
      throw new Error(
        `Unsupported bridge route: ${params.fromChainIndex} → ${params.toChainIndex}`,
      );
    }

    this.logger(
      `Bridge quote: ${CHAIN_INFO[params.fromChainIndex]?.name} → ${CHAIN_INFO[params.toChainIndex]?.name}`,
    );

    // Strategy 1: Try OnchainOS cross-chain API
    try {
      return await this.getCrossChainQuote(params);
    } catch (e) {
      this.logger(`OnchainOS cross-chain unavailable, using two-step route`);
    }

    // Strategy 2: Two-step via USDC bridge
    return this.getTwoStepQuote(params);
  }

  /**
   * Get a bridge quote using OnchainOS cross-chain API.
   * This aggregates multiple bridges (Stargate, Across, Celer, etc.)
   */
  private async getCrossChainQuote(params: BridgeQuoteParams): Promise<BridgeQuoteResult> {
    // Use the v5 cross-chain API (when available on upgraded plans)
    const queryParams: Record<string, string> = {
      fromChainId: params.fromChainIndex,
      toChainId: params.toChainIndex,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      slippagePercent: params.slippagePercent ?? '1',
    };

    if (params.userWalletAddress) {
      queryParams.userWalletAddress = params.userWalletAddress;
    }

    // This calls the OnchainOS cross-chain endpoint
    // Currently requires upgraded API plan
    const result = await (this.provider as any).request(
      'GET',
      '/api/v5/dex/cross-chain/quote',
      queryParams,
    );

    const data = Array.isArray(result) ? result[0] : result;

    return {
      route: {
        bridgeName: data.bridgeName ?? 'OnchainOS Bridge',
        steps: [
          {
            type: 'bridge',
            chainIndex: params.fromChainIndex,
            protocol: data.bridgeName ?? 'aggregated',
            fromToken: params.fromTokenAddress,
            toToken: params.toTokenAddress,
            amount: params.amount,
          },
        ],
        description: `${CHAIN_INFO[params.fromChainIndex]?.name} → ${CHAIN_INFO[params.toChainIndex]?.name} via ${data.bridgeName ?? 'OnchainOS'}`,
      },
      toTokenAmount: data.toTokenAmount ?? data.receiveAmount ?? '0',
      fromToken: {
        symbol: data.fromToken?.tokenSymbol ?? 'UNKNOWN',
        decimals: parseInt(data.fromToken?.decimal ?? '18'),
        address: params.fromTokenAddress,
      },
      toToken: {
        symbol: data.toToken?.tokenSymbol ?? 'UNKNOWN',
        decimals: parseInt(data.toToken?.decimal ?? '18'),
        address: params.toTokenAddress,
      },
      estimatedFeeUsd: data.estimateFee ?? '0',
      estimatedTimeSeconds: parseInt(data.estimateTime ?? '300'),
      minReceiveAmount: data.minReceiveAmount ?? data.receiveAmount ?? '0',
      tx: data.tx ? {
        from: data.tx.from,
        to: data.tx.to,
        data: data.tx.data,
        value: data.tx.value ?? '0',
        gas: data.tx.gas ?? '300000',
        gasPrice: data.tx.gasPrice ?? '0',
        chainId: params.fromChainIndex,
      } : undefined,
    };
  }

  /**
   * Get a two-step bridge quote:
   * 1. Swap source token → USDC on source chain (if needed)
   * 2. Bridge USDC across chains (estimated)
   * 3. Swap USDC → target token on dest chain (if needed)
   */
  private async getTwoStepQuote(params: BridgeQuoteParams): Promise<BridgeQuoteResult> {
    const sourceUsdc = USDC_ADDRESSES[params.fromChainIndex];
    const destUsdc = USDC_ADDRESSES[params.toChainIndex];
    const steps: BridgeStep[] = [];

    let currentAmount = params.amount;
    let usdcAmount = currentAmount;

    // Step 1: If source token is NOT USDC, swap to USDC first
    const isSourceUsdc = params.fromTokenAddress.toLowerCase() === sourceUsdc?.toLowerCase();
    if (!isSourceUsdc && sourceUsdc) {
      try {
        const swapQuote = await this.provider.getQuote({
          chainIndex: params.fromChainIndex,
          fromTokenAddress: params.fromTokenAddress,
          toTokenAddress: sourceUsdc,
          amount: currentAmount,
        });

        usdcAmount = swapQuote.toTokenAmount;

        steps.push({
          type: 'swap',
          chainIndex: params.fromChainIndex,
          protocol: swapQuote.dexRouterList?.[0]?.dexProtocol?.dexName ?? 'DEX',
          fromToken: params.fromTokenAddress,
          toToken: sourceUsdc,
          amount: currentAmount,
        });

        this.logger(
          `Step 1: Swap on ${CHAIN_INFO[params.fromChainIndex]?.name}: ${currentAmount} → ${usdcAmount} USDC`,
        );
      } catch {
        // If swap quote fails, pass through
        usdcAmount = currentAmount;
      }
    }

    // Step 2: Bridge USDC across chains
    steps.push({
      type: 'bridge',
      chainIndex: params.fromChainIndex,
      protocol: 'USDC Native Bridge',
      fromToken: sourceUsdc ?? params.fromTokenAddress,
      toToken: destUsdc ?? params.toTokenAddress,
      amount: usdcAmount,
    });

    // Estimate bridge fee (~0.1% + gas)
    const bridgeFeeRate = 0.001;
    const afterBridge = Math.floor(Number(usdcAmount) * (1 - bridgeFeeRate)).toString();

    this.logger(`Step 2: Bridge ${usdcAmount} USDC → ${CHAIN_INFO[params.toChainIndex]?.name}`);

    // Step 3: If destination token is NOT USDC, swap on destination
    let finalAmount = afterBridge;
    const isDestUsdc = params.toTokenAddress.toLowerCase() === destUsdc?.toLowerCase();
    if (!isDestUsdc && destUsdc) {
      try {
        const destSwapQuote = await this.provider.getQuote({
          chainIndex: params.toChainIndex,
          fromTokenAddress: destUsdc,
          toTokenAddress: params.toTokenAddress,
          amount: afterBridge,
        });

        finalAmount = destSwapQuote.toTokenAmount;

        steps.push({
          type: 'swap',
          chainIndex: params.toChainIndex,
          protocol: destSwapQuote.dexRouterList?.[0]?.dexProtocol?.dexName ?? 'DEX',
          fromToken: destUsdc,
          toToken: params.toTokenAddress,
          amount: afterBridge,
        });

        this.logger(
          `Step 3: Swap on ${CHAIN_INFO[params.toChainIndex]?.name}: ${afterBridge} USDC → ${finalAmount}`,
        );
      } catch {
        finalAmount = afterBridge;
      }
    }

    const fromInfo = CHAIN_INFO[params.fromChainIndex];
    const toInfo = CHAIN_INFO[params.toChainIndex];

    return {
      route: {
        bridgeName: 'Two-Step Bridge (Swap → Bridge → Swap)',
        steps,
        description: `${fromInfo?.name} → USDC Bridge → ${toInfo?.name}`,
      },
      toTokenAmount: finalAmount,
      fromToken: {
        symbol: isSourceUsdc ? 'USDC' : fromInfo?.nativeSymbol ?? 'UNKNOWN',
        decimals: isSourceUsdc ? 6 : 18,
        address: params.fromTokenAddress,
      },
      toToken: {
        symbol: isDestUsdc ? 'USDC' : toInfo?.nativeSymbol ?? 'UNKNOWN',
        decimals: isDestUsdc ? 6 : 18,
        address: params.toTokenAddress,
      },
      estimatedFeeUsd: (Number(usdcAmount) * bridgeFeeRate / 1e6).toFixed(4),
      estimatedTimeSeconds: 300, // ~5 minutes typical
      minReceiveAmount: Math.floor(Number(finalAmount) * 0.99).toString(), // 1% slippage
    };
  }

  // ── Convenience Methods ────────────────────────────────────────

  /**
   * Quick bridge: USDC between any two supported chains.
   * Simplest cross-chain transfer — USDC in, USDC out.
   */
  async bridgeUsdc(
    fromChainIndex: string,
    toChainIndex: string,
    amount: string,
    userWalletAddress?: string,
  ): Promise<BridgeQuoteResult> {
    const fromUsdc = USDC_ADDRESSES[fromChainIndex];
    const toUsdc = USDC_ADDRESSES[toChainIndex];

    if (!fromUsdc || !toUsdc) {
      throw new Error(`USDC not supported on chain ${!fromUsdc ? fromChainIndex : toChainIndex}`);
    }

    return this.getQuote({
      fromChainIndex,
      toChainIndex,
      fromTokenAddress: fromUsdc,
      toTokenAddress: toUsdc,
      amount,
      userWalletAddress,
    });
  }

  /**
   * Bridge native token from one chain to another.
   * e.g. ETH (Base) → OKB (X Layer)
   */
  async bridgeNative(
    fromChainIndex: string,
    toChainIndex: string,
    amount: string,
    userWalletAddress?: string,
  ): Promise<BridgeQuoteResult> {
    const fromNative = CHAIN_INFO[fromChainIndex]?.nativeAddress;
    const toNative = CHAIN_INFO[toChainIndex]?.nativeAddress;

    if (!fromNative || !toNative) {
      throw new Error(`Chain not supported: ${fromChainIndex} or ${toChainIndex}`);
    }

    return this.getQuote({
      fromChainIndex,
      toChainIndex,
      fromTokenAddress: fromNative,
      toTokenAddress: toNative,
      amount,
      userWalletAddress,
    });
  }

  /**
   * Get estimated bridge time between two chains (seconds).
   */
  getEstimatedTime(fromChainIndex: string, toChainIndex: string): number {
    // L2 → L2 is fastest (~2-5 min)
    const l2s = ['8453', '42161', '10', '196'];
    if (l2s.includes(fromChainIndex) && l2s.includes(toChainIndex)) {
      return 180; // 3 minutes
    }
    // L1 → L2 or L2 → L1
    if (fromChainIndex === '1' || toChainIndex === '1') {
      return 600; // 10 minutes
    }
    return 300; // 5 minutes default
  }
}
