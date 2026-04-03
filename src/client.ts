import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import { PaymentAdapter } from './adapters/types';
import { BudgetPolicy, PolicyEngine } from './policy';

export interface OWSClientOptions {
  baseURL: string;
  policy: BudgetPolicy;
  /** Any chain adapter implementing PaymentAdapter (Base, Stellar, etc.) */
  adapter: PaymentAdapter;
}

/**
 * OwsClient — OWS-compliant autonomous HTTP client for AI agents.
 *
 * Wraps Axios with an interceptor that automatically detects HTTP 402
 * Payment Required responses, validates the spend against an on-device
 * PolicyEngine, settles the payment on-chain via a pluggable adapter,
 * and retries the original request with a signed X-PAYMENT proof —
 * all without any human interaction.
 *
 * Chain-agnostic: works with BasePaymentAdapter, StellarPaymentAdapter,
 * or any future adapter implementing the PaymentAdapter interface.
 *
 * @see https://openwallet.sh for the Open Wallet Standard specification.
 * @see https://x402.org for the x402 payment protocol.
 * @see https://pay.asgcard.dev for the production ASG Pay infrastructure.
 */
export class OwsClient {
  public api: AxiosInstance;
  public policyEngine: PolicyEngine;
  private adapter: PaymentAdapter;

  constructor(options: OWSClientOptions) {
    this.policyEngine = new PolicyEngine(options.policy);
    this.adapter = options.adapter;

    this.api = axios.create({
      baseURL: options.baseURL,
    });

    // ── Axios Interceptor: Autonomous 402 Handler ─────────────────────
    this.api.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError) => {
        if (error.response && error.response.status === 402) {
          console.log('[OWS Client] ⚡ Received 402 Payment Required challenge');

          const challenge = error.response.data as any;

          // Validate OWS envelope
          if (!challenge.x402Version && !challenge.accepts) {
            return Promise.reject(
              new Error('Unrecognisable 402 challenge format — not OWS-compliant.')
            );
          }

          // Extract USD amount from the resource description (demo heuristic)
          const desc: string = challenge.resource?.description || '';
          const match = desc.match(/\$(\d+(\.\d+)?)/);
          const requestedUsdAmount = match ? parseFloat(match[1]) : 0;

          console.log(`[OWS Client] 💰 Requested payment: $${requestedUsdAmount}`);
          console.log(`[OWS Client] ⛓️  Settlement chain: ${this.adapter.chainName} (${this.adapter.caip2Id})`);

          const acceptRules = challenge.accepts[0];
          const { payTo, amount: atomicAmount, network } = acceptRules;

          // ── Step 1: Policy gate ─────────────────────────────────────
          if (!this.policyEngine.checkPolicy(requestedUsdAmount, payTo)) {
            console.error('[OWS Client] 🛑 Payment REJECTED by Policy Engine');
            return Promise.reject(error);
          }

          console.log('[OWS Client] ✅ Policy check PASSED — settling on-chain…');

          // ── Step 2: On-chain settlement (chain-agnostic) ────────────
          const txHash = await this.adapter.pay(payTo, atomicAmount, network);

          if (!txHash) {
            console.error('[OWS Client] ❌ Settlement transaction failed');
            return Promise.reject(error);
          }

          // ── Step 3: Record spend in budget tracker ──────────────────
          this.policyEngine.recordSpend(requestedUsdAmount);

          console.log('[OWS Client] 🔁 Constructing X-PAYMENT token and retrying…');

          // ── Step 4: Build OWS X-PAYMENT proof ───────────────────────
          const paymentPayload = {
            x402Version: 2,
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

          const tokenBase64 = Buffer.from(JSON.stringify(paymentPayload)).toString(
            'base64'
          );

          // ── Step 5: Retry the original request ──────────────────────
          const originalRequest = error.config;
          if (originalRequest) {
            if (!originalRequest.headers) {
              originalRequest.headers = {} as any;
            }
            originalRequest.headers['X-PAYMENT'] = tokenBase64;
            return this.api.request(originalRequest);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * High-level helper for AI agents.
   * The agent simply calls performTask() — the OWS interceptor handles
   * everything else (payment, policy, retry) transparently.
   */
  async performTask(endpoint: string, data: any) {
    console.log(`[AI Agent] 🧠 Sending task to ${endpoint}`);
    const res = await this.api.post(endpoint, data);
    console.log(`[AI Agent] ✅ Task completed:`, res.data?.message || res.data);
    return res.data;
  }
}
