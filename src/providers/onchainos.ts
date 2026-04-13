/**
 * OnchainOS API Provider for ASG Pay
 * 
 * Provides DEX aggregation (400+ DEX sources), gas estimation,
 * and transaction broadcast via OKX OnchainOS infrastructure.
 * 
 * This is an OPTIONAL provider — all existing direct viem/Uniswap
 * flows continue to work unchanged.
 * 
 * @see https://web3.okx.com/onchainos/dev-docs/trade/dex-api-introduction
 */

import * as crypto from 'crypto';
import * as https from 'https';
import { Logger, noopLogger } from '../logger';

// ─── Types ──────────────────────────────────────────────────────────

export interface OnchainOSConfig {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  logger?: Logger;
}

export interface DexQuoteParams {
  chainIndex: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  slippagePercent?: string;
}

export interface DexSwapParams extends DexQuoteParams {
  userWalletAddress: string;
}

export interface DexQuoteResult {
  chainIndex: string;
  fromToken: TokenInfo;
  toToken: TokenInfo;
  fromTokenAmount: string;
  toTokenAmount: string;
  tradeFee: string;
  estimateGasFee: string;
  dexRouterList: DexRoute[];
  priceImpactPercent: string;
}

export interface DexSwapResult {
  routerResult: DexQuoteResult;
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
    minReceiveAmount: string;
  };
}

export interface TokenInfo {
  tokenContractAddress: string;
  tokenSymbol: string;
  tokenUnitPrice: string;
  decimal: string;
  isHoneyPot: boolean;
  taxRate: string;
}

export interface DexRoute {
  dexProtocol: { dexName: string; percent: string };
  fromToken: TokenInfo;
  toToken: TokenInfo;
}

export interface SupportedChain {
  chainIndex: string;
  chainName: string;
}

export interface GasPrice {
  normal: string;
  min: string;
  max: string;
  suggestGasPrice: string;
}

// ─── OnchainOS Provider ────────────────────────────────────────────

export class OnchainOSProvider {
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly passphrase: string;
  private readonly logger: Logger;
  private readonly baseUrl = 'https://web3.okx.com';

  constructor(config: OnchainOSConfig) {
    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.passphrase = config.passphrase;
    this.logger = config.logger ?? noopLogger;
  }

  // ── Auth ─────────────────────────────────────────────────────────

  private sign(
    method: 'GET' | 'POST',
    requestPath: string,
    queryString: string = '',
    body: string = '',
  ): Record<string, string> {
    const timestamp = new Date().toISOString();
    const preHash = timestamp + method + requestPath + (method === 'GET' ? queryString : body);
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(preHash)
      .digest('base64');

    return {
      'Content-Type': 'application/json',
      'OK-ACCESS-KEY': this.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.passphrase,
    };
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    params?: Record<string, string>,
    body?: Record<string, unknown>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const queryString = params
        ? '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
        : '';
      const bodyStr = body ? JSON.stringify(body) : '';
      const headers = this.sign(method, path, queryString, bodyStr);

      const options: https.RequestOptions = {
        hostname: 'web3.okx.com',
        path: path + (method === 'GET' ? queryString : ''),
        method,
        headers,
      };

      this.logger(`OnchainOS ${method} ${path}${queryString}`);

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as { code: string; msg: string; data: T };
            if (parsed.code === '0') {
              resolve(parsed.data);
            } else {
              reject(new Error(`OnchainOS API error ${parsed.code}: ${parsed.msg}`));
            }
          } catch (e) {
            reject(new Error(`OnchainOS parse error: ${data.substring(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      if (method === 'POST' && bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  // ── DEX Aggregator ───────────────────────────────────────────────

  /** Get all chains supported by the DEX aggregator. */
  async getSupportedChains(): Promise<SupportedChain[]> {
    return this.request<SupportedChain[]>('GET', '/api/v6/dex/aggregator/supported/chain');
  }

  /**
   * Get a price quote for a token swap (no calldata — read-only).
   * Routes through 400+ DEX sources for optimal pricing.
   */
  async getQuote(params: DexQuoteParams): Promise<DexQuoteResult> {
    const result = await this.request<DexQuoteResult[]>('GET', '/api/v6/dex/aggregator/quote', {
      chainIndex: params.chainIndex,
      amount: params.amount,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      ...(params.slippagePercent ? { slippagePercent: params.slippagePercent } : {}),
    });
    return (result as any)[0]?.routerResult ?? (result as any)[0];
  }

  /**
   * Get swap transaction calldata for execution.
   * Returns ready-to-sign transaction data.
   */
  async getSwapData(params: DexSwapParams): Promise<DexSwapResult> {
    const result = await this.request<DexSwapResult[]>('GET', '/api/v6/dex/aggregator/swap', {
      chainIndex: params.chainIndex,
      amount: params.amount,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      userWalletAddress: params.userWalletAddress,
      slippagePercent: params.slippagePercent ?? '0.5',
    });
    return (result as any)[0];
  }

  // ── Gas ──────────────────────────────────────────────────────────

  /** Get current gas price for a chain. */
  async getGasPrice(chainIndex: string): Promise<GasPrice> {
    const result = await this.request<GasPrice[]>(
      'POST',
      '/api/v6/dex/pre-transaction/gas-price',
      undefined,
      { chainIndex },
    );
    return (result as any)[0];
  }

  // ── Wallet Balance ───────────────────────────────────────────────

  /**
   * Get total token balances for an address across a chain.
   * Uses OnchainOS infrastructure — no direct RPC needed.
   */
  async getBalances(
    address: string,
    chainIndex: string,
  ): Promise<Array<{ tokenContractAddress: string; symbol: string; balance: string; tokenPrice: string }>> {
    return this.request('GET', '/api/v6/wallet/asset/all-token-balances', {
      address,
      chainIndex,
    });
  }

  // ── Tx History ───────────────────────────────────────────────────

  /** Get transaction history for an address. */
  async getTxHistory(
    address: string,
    chainIndex: string,
    limit: string = '20',
  ): Promise<unknown[]> {
    return this.request('GET', '/api/v6/wallet/post-transaction/transactions-by-address', {
      address,
      chainIndex,
      limit,
    });
  }

  // ── Health Check ─────────────────────────────────────────────────

  /**
   * Test API connectivity — returns the number of supported DEX chains.
   * Useful for verifying credentials at startup.
   */
  async healthCheck(): Promise<{ ok: boolean; chains: number; xlayer: boolean }> {
    try {
      const chains = await this.getSupportedChains();
      const xlayer = chains.some((c) => c.chainIndex === '196');
      return { ok: true, chains: chains.length, xlayer };
    } catch {
      return { ok: false, chains: 0, xlayer: false };
    }
  }
}

// ─── Factory ───────────────────────────────────────────────────────

/**
 * Create an OnchainOS provider from environment variables.
 * Expects: OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE
 */
export function createOnchainOSFromEnv(logger?: Logger): OnchainOSProvider | null {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;

  if (!apiKey || !secretKey || !passphrase) {
    return null;
  }

  return new OnchainOSProvider({ apiKey, secretKey, passphrase, logger });
}
