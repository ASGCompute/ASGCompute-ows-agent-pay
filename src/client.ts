import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import { PaymentAdapter } from './adapters/types';
import { BudgetPolicy, PolicyEngine } from './policy';
import { Logger, noopLogger } from './logger';
import {
  detectProtocol,
  extractMppChallenges,
  decodeChallengeRequest,
  MppChallenge,
  MppRequestObject,
} from './mpp';
import { StripePaymentAdapter } from './adapters/stripe';

export interface OWSClientOptions {
  /** Base URL of the API that returns 402 challenges. */
  baseURL: string;
  /** Budget policy for the agent. */
  policy: BudgetPolicy;
  /** Any chain adapter implementing PaymentAdapter (EVM, Stellar, Stripe, etc.) */
  adapter: PaymentAdapter;
  /**
   * Optional logger function. If omitted, SDK is silent.
   * Pass `console.log` for verbose output.
   *
   * @example
   * ```ts
   * const client = new OwsClient({
   *   baseURL: 'https://api.example.com',
   *   policy: { monthlyBudget: 10, maxAmountPerTransaction: 1 },
   *   adapter: new EvmPaymentAdapter({ chain: 'base' }),
   *   logger: console.log,
   * });
   * ```
   */
  logger?: Logger;
}

/**
 * x402 challenge envelope as returned by OWS-compliant servers.
 */
interface X402Challenge {
  x402Version: number;
  resource?: {
    url?: string;
    description?: string;
    /** Explicit USD amount (preferred over text parsing). */
    usdAmount?: number;
  };
  accepts: Array<{
    scheme: string;
    network: string;
    amount: string;
    maxAmountRequired?: string;
    payTo: string;
    asset: string;
  }>;
}

/**
 * OwsClient — Dual-protocol autonomous HTTP client for AI agents.
 *
 * Supports BOTH payment protocols:
 * - **x402** (Coinbase/Cloudflare): JSON body challenges + X-PAYMENT header
 * - **MPP** (Stripe/Tempo): WWW-Authenticate challenges + Authorization: Payment header
 *
 * Wraps Axios with an interceptor that automatically detects the protocol,
 * validates spend against PolicyEngine, settles via pluggable adapter,
 * and retries — all without human interaction.
 *
 * @see https://openwallet.sh — Open Wallet Standard specification
 * @see https://x402.org — x402 payment protocol
 * @see https://mpp.dev — Machine Payments Protocol
 * @see https://pay.asgcard.dev — Production ASG Pay infrastructure
 */
export class OwsClient {
  public readonly api: AxiosInstance;
  public readonly policyEngine: PolicyEngine;
  private adapter: PaymentAdapter;
  private log: Logger;

  constructor(options: OWSClientOptions) {
    this.log = options.logger ?? noopLogger;
    this.policyEngine = new PolicyEngine(options.policy, this.log);
    this.adapter = options.adapter;

    this.api = axios.create({
      baseURL: options.baseURL,
    });

    // ── Axios Interceptor: Dual-Protocol 402 Handler ────────────────
    this.api.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError) => {
        if (error.response && error.response.status === 402) {
          return this.handle402(error);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Handle a 402 Payment Required challenge.
   * Auto-detects protocol (MPP vs x402) and routes accordingly.
   */
  private async handle402(error: AxiosError): Promise<AxiosResponse> {
    this.log('[OWS] ⚡ Received 402 Payment Required');

    // Detect protocol from response
    const headers = error.response!.headers as Record<string, string | string[] | undefined>;
    const body = error.response!.data;
    const protocol = detectProtocol(headers, body);

    this.log(`[OWS] 🔍 Protocol detected: ${protocol}`);

    switch (protocol) {
      case 'mpp':
        return this.handleMpp402(error, headers);
      case 'x402':
        return this.handleX402(error);
      default:
        throw new Error('Unrecognisable 402 challenge — neither x402 nor MPP.');
    }
  }

  // ─── MPP Protocol Handler ─────────────────────────────────────────

  /**
   * Handle an MPP 402: parse WWW-Authenticate, create credential, retry.
   */
  private async handleMpp402(
    error: AxiosError,
    headers: Record<string, string | string[] | undefined>
  ): Promise<AxiosResponse> {
    this.log('[OWS/MPP] 🏛️ Processing MPP challenge');

    // ── Step 1: Parse challenges from WWW-Authenticate headers ────
    const challenges = extractMppChallenges(headers);
    if (challenges.length === 0) {
      throw new Error('MPP 402 but no valid Payment challenges in WWW-Authenticate header.');
    }

    // Select the best challenge (prefer stripe if adapter is Stripe, else first)
    const challenge = this.selectChallenge(challenges);
    this.log(`[OWS/MPP] 📋 Challenge: method=${challenge.method}, id=${challenge.id}, realm=${challenge.realm}`);

    // ── Step 2: Check expiration ──────────────────────────────────
    if (challenge.expires) {
      const expiresAt = new Date(challenge.expires).getTime();
      if (Date.now() > expiresAt) {
        this.log('[OWS/MPP] 🛑 Challenge expired');
        return Promise.reject(error);
      }
    }

    // ── Step 3: Decode request and extract amount ─────────────────
    const request = decodeChallengeRequest(challenge);
    const requestedUsdAmount = this.extractMppUsdAmount(request);

    this.log(`[OWS/MPP] 💰 Amount: $${requestedUsdAmount} ${request.currency?.toUpperCase() || 'USD'}`);

    // ── Step 4: Policy gate ───────────────────────────────────────
    if (!this.policyEngine.checkPolicy(requestedUsdAmount, request.recipient)) {
      this.log('[OWS/MPP] 🛑 REJECTED by PolicyEngine');
      return Promise.reject(error);
    }
    this.log('[OWS/MPP] ✅ Policy passed — settling via adapter…');

    // ── Step 5: Pass challenge to adapter (if Stripe) ─────────────
    if (this.isStripeAdapter(this.adapter)) {
      this.adapter.setMppChallenge(challenge);
    }

    // ── Step 6: Settle via adapter ────────────────────────────────
    const result = await this.adapter.pay(
      request.recipient || challenge.realm,
      request.amount,
      challenge.method
    );

    if (!result) {
      this.log('[OWS/MPP] ❌ Settlement failed');
      return Promise.reject(error);
    }

    // ── Step 7: Record spend ──────────────────────────────────────
    this.policyEngine.recordSpend(requestedUsdAmount);

    // ── Step 8: Build Authorization header ────────────────────────
    // For Stripe adapter: result IS the base64url credential
    // For others: wrap result as a generic credential
    let authHeader: string;
    if (this.isStripeAdapter(this.adapter) && this.adapter.getLastCredential()) {
      authHeader = `Payment ${this.adapter.getLastCredential()}`;
    } else {
      // Generic credential for non-Stripe MPP methods
      const credentialPayload = {
        challenge: {
          id: challenge.id,
          realm: challenge.realm,
          method: challenge.method,
          intent: challenge.intent,
          request: challenge.request,
          ...(challenge.expires ? { expires: challenge.expires } : {}),
        },
        source: this.adapter.getAddress(),
        payload: { transaction: result },
      };
      const encoded = Buffer.from(JSON.stringify(credentialPayload))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      authHeader = `Payment ${encoded}`;
    }

    this.log(`[OWS/MPP] 🔁 Retrying with Authorization: Payment …`);

    // ── Step 9: Retry original request ────────────────────────────
    const originalRequest = error.config;
    if (!originalRequest) {
      throw new Error('Cannot retry — original request config is missing.');
    }
    if (!originalRequest.headers) {
      originalRequest.headers = {} as any;
    }
    originalRequest.headers['Authorization'] = authHeader;

    return this.api.request(originalRequest);
  }

  // ─── x402 Protocol Handler ────────────────────────────────────────

  /**
   * Handle an x402 402: parse JSON body, settle on-chain, retry with X-PAYMENT.
   */
  private async handleX402(error: AxiosError): Promise<AxiosResponse> {
    this.log('[OWS/x402] ⛓️ Processing x402 challenge');

    const challenge = error.response!.data as X402Challenge;

    // Validate x402 envelope
    if (!challenge.x402Version && !challenge.accepts) {
      throw new Error('Unrecognisable 402 challenge — not x402-compliant.');
    }

    if (!challenge.accepts || challenge.accepts.length === 0) {
      throw new Error('402 challenge has no accepts[] entries.');
    }

    const acceptRules = challenge.accepts[0];
    const { payTo, amount: atomicAmount, network } = acceptRules;

    // ── Extract USD amount ────────────────────────────────────────
    const requestedUsdAmount = this.extractUsdAmount(challenge, acceptRules);

    this.log(`[OWS/x402] 💰 Amount: $${requestedUsdAmount} → ${payTo.slice(0, 10)}…`);
    this.log(`[OWS/x402] ⛓️  Chain: ${this.adapter.chainName} (${this.adapter.caip2Id})`);

    // ── Policy gate ───────────────────────────────────────────────
    if (!this.policyEngine.checkPolicy(requestedUsdAmount, payTo)) {
      this.log('[OWS/x402] 🛑 REJECTED by PolicyEngine');
      return Promise.reject(error);
    }

    this.log('[OWS/x402] ✅ Policy passed — settling on-chain…');

    // ── On-chain settlement ───────────────────────────────────────
    const txHash = await this.adapter.pay(payTo, atomicAmount, network);

    if (!txHash) {
      this.log('[OWS/x402] ❌ Settlement failed');
      return Promise.reject(error);
    }

    // ── Record spend ──────────────────────────────────────────────
    this.policyEngine.recordSpend(requestedUsdAmount);

    // ── Build X-PAYMENT proof ─────────────────────────────────────
    const paymentPayload = {
      x402Version: challenge.x402Version || 2,
      accepted: {
        scheme: acceptRules.scheme,
        network: acceptRules.network,
        amount: acceptRules.amount,
        payTo: acceptRules.payTo,
        asset: acceptRules.asset,
      },
      payload: {
        transaction: txHash,
        chain: this.adapter.caip2Id,
      },
    };

    const tokenBase64 = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

    this.log(`[OWS/x402] 🔁 Retrying with X-PAYMENT (tx: ${txHash.slice(0, 16)}…)`);

    // ── Retry original request ────────────────────────────────────
    const originalRequest = error.config;
    if (!originalRequest) {
      throw new Error('Cannot retry — original request config is missing.');
    }

    if (!originalRequest.headers) {
      originalRequest.headers = {} as any;
    }
    originalRequest.headers['X-PAYMENT'] = tokenBase64;

    return this.api.request(originalRequest);
  }

  // ─── MPP Helpers ──────────────────────────────────────────────────

  /**
   * Select the best challenge when multiple are offered.
   * Prefers the method matching the current adapter.
   */
  private selectChallenge(challenges: MppChallenge[]): MppChallenge {
    if (challenges.length === 1) return challenges[0];

    // Match adapter type to challenge method
    if (this.isStripeAdapter(this.adapter)) {
      const stripeChallenge = challenges.find((c) => c.method === 'stripe');
      if (stripeChallenge) return stripeChallenge;
    }

    // Fallback: first challenge
    return challenges[0];
  }

  /**
   * Extract USD amount from MPP request object.
   */
  private extractMppUsdAmount(request: MppRequestObject): number {
    const amount = parseFloat(request.amount);
    if (isNaN(amount) || amount <= 0) return 0.01;

    // If currency is USD and has decimals info, convert
    const decimals = request.decimals ?? 2;
    return amount / Math.pow(10, decimals);
  }

  // ─── x402 Helpers ─────────────────────────────────────────────────

  /**
   * Extract USD amount from x402 challenge.
   * Priority: resource.usdAmount → accepts[].maxAmountRequired → heuristic from description.
   */
  private extractUsdAmount(
    challenge: X402Challenge,
    acceptRules: X402Challenge['accepts'][0]
  ): number {
    // 1. Explicit USD amount field (best)
    if (challenge.resource?.usdAmount && challenge.resource.usdAmount > 0) {
      return challenge.resource.usdAmount;
    }

    // 2. maxAmountRequired in accepts (x402 v2)
    if (acceptRules.maxAmountRequired) {
      const parsed = parseFloat(acceptRules.maxAmountRequired);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    // 3. Fallback: parse from description text (last resort)
    const desc = challenge.resource?.description || '';
    const match = desc.match(/\$(\d+(?:\.\d+)?)/);
    if (match) {
      return parseFloat(match[1]);
    }

    // 4. Last resort: use atomic amount as-is
    this.log('[OWS] ⚠️ Could not determine USD amount — using atomic fallback');
    return parseFloat(atomicToUsd(acceptRules.amount, acceptRules.asset));
  }

  // ─── Type Guards ──────────────────────────────────────────────────

  private isStripeAdapter(adapter: PaymentAdapter): adapter is StripePaymentAdapter {
    return adapter.chainName === 'Stripe MPP';
  }

  // ─── Public API ───────────────────────────────────────────────────

  /**
   * High-level helper for AI agents.
   * The agent simply calls performTask() — the interceptor handles
   * everything else (payment, policy, retry) transparently.
   */
  async performTask(endpoint: string, data?: any): Promise<any> {
    this.log(`[Agent] 🧠 Sending task to ${endpoint}`);
    const res = await this.api.post(endpoint, data);
    this.log(`[Agent] ✅ Task completed`);
    return res.data;
  }

  /**
   * GET request with autonomous 402 handling.
   */
  async get(endpoint: string): Promise<any> {
    const res = await this.api.get(endpoint);
    return res.data;
  }
}

/**
 * Convert atomic units to approximate USD (best-effort).
 * Used only as a last-resort fallback.
 */
function atomicToUsd(amount: string, asset: string): string {
  const n = BigInt(amount);
  switch (asset.toUpperCase()) {
    case 'USDC':
      return (Number(n) / 1e6).toFixed(2);
    case 'ETH':
      return (Number(n) / 1e18 * 3000).toFixed(2);
    case 'XLM':
      return (Number(n) / 1e7 * 0.1).toFixed(2);
    default:
      return '0.01';
  }
}
