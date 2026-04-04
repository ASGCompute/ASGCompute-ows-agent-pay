/**
 * IntentResolver — Parses natural-language payment intents into PaymentPlans.
 *
 * Agents express payment desires as simple strings ("pay $5", "send 10 USDC
 * to 0x1234..."). The IntentResolver parses these into structured PayIntent
 * objects, then delegates to ChainRouter for execution planning.
 *
 * Supports:
 * - "$5" / "$5.00" — USD amounts
 * - "5 USDC" / "10 XLM" — Asset-specific amounts
 * - "to 0x..." / "to G..." / "to ..." — destination extraction
 * - "memo: invoice-123" — memo extraction
 *
 * @see ERC-7521 — Intent-centric execution pattern
 */

import { PayIntent } from './types';

/**
 * Pattern: "$5.00" or "$5"
 */
const USD_AMOUNT_RE = /\$(\d+(?:\.\d{1,2})?)/;

/**
 * Pattern: "5 USDC" or "10.5 ETH"
 */
const ASSET_AMOUNT_RE = /(\d+(?:\.\d+)?)\s+(USDC|ETH|XLM|SOL|USD|USDT|DAI|BTC)/i;

/**
 * Pattern: Ethereum-style address "0x..." (42 chars)
 */
const ETH_ADDRESS_RE = /\b(0x[a-fA-F0-9]{40})\b/;

/**
 * Pattern: Stellar-style address "G..." (56 chars)
 */
const STELLAR_ADDRESS_RE = /\b(G[A-Z2-7]{55})\b/;

/**
 * Pattern: Solana-style address (base58, 32-44 chars)
 */
const SOLANA_ADDRESS_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

/**
 * Pattern: "memo: <text>" or "memo:<text>"
 */
const MEMO_RE = /memo:\s*([^\s,]+)/i;

/**
 * Rough USD rates for intent parsing (same as BalanceAggregator).
 */
const INTENT_RATES: Record<string, number> = {
  USDC: 1,
  USDT: 1,
  DAI: 1,
  USD: 1,
  ETH: 3200,
  XLM: 0.12,
  SOL: 170,
  BTC: 95000,
};

export class IntentResolver {
  /**
   * Parse a natural-language payment intent string into a structured PayIntent.
   *
   * @example
   * resolve('pay $5 to 0x1234...');           // { amount: '5.00', destination: '0x1234...' }
   * resolve('send 100 USDC memo: inv-42');    // { amount: '100', asset: 'USDC', memo: 'inv-42' }
   * resolve('$0.50');                          // { amount: '0.50' }
   */
  resolve(input: string): PayIntent {
    const intent: PayIntent = {
      amount: '0',
    };

    // ── Extract USD amount ──────────────────────────────────────────
    const usdMatch = input.match(USD_AMOUNT_RE);
    if (usdMatch) {
      intent.amount = usdMatch[1];
      intent.asset = 'USDC';
    }

    // ── Extract asset-denominated amount ────────────────────────────
    const assetMatch = input.match(ASSET_AMOUNT_RE);
    if (assetMatch) {
      const rawAmount = parseFloat(assetMatch[1]);
      const asset = assetMatch[2].toUpperCase();
      intent.asset = asset;

      // Convert to USD for the amount field
      const rate = INTENT_RATES[asset] ?? 1;
      intent.amount = (rawAmount * rate).toFixed(2);
    }

    // ── Extract destination ─────────────────────────────────────────
    const ethMatch = input.match(ETH_ADDRESS_RE);
    if (ethMatch) {
      intent.destination = ethMatch[1];
    } else {
      const stellarMatch = input.match(STELLAR_ADDRESS_RE);
      if (stellarMatch) {
        intent.destination = stellarMatch[1];
      } else {
        const solanaMatch = input.match(SOLANA_ADDRESS_RE);
        if (solanaMatch) {
          intent.destination = solanaMatch[1];
        }
      }
    }

    // ── Extract memo ────────────────────────────────────────────────
    const memoMatch = input.match(MEMO_RE);
    if (memoMatch) {
      intent.memo = memoMatch[1];
    }

    return intent;
  }

  /**
   * Validate that a PayIntent has the minimum required fields.
   */
  validate(intent: PayIntent): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const amount = parseFloat(intent.amount);

    if (isNaN(amount) || amount <= 0) {
      errors.push('Amount must be a positive number');
    }

    if (amount > 1_000_000) {
      errors.push('Amount exceeds maximum ($1,000,000)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Convert a raw USD amount string to a specific asset amount.
   */
  usdToAsset(usdAmount: string, asset: string): string {
    const usd = parseFloat(usdAmount);
    if (isNaN(usd)) return '0';

    const rate = INTENT_RATES[asset.toUpperCase()] ?? 1;
    return (usd / rate).toFixed(asset.toUpperCase() === 'XLM' ? 7 : 6);
  }
}
