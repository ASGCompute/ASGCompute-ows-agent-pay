/**
 * ASG Pay — Server-Side Payment Gating
 *
 * Express/Connect-compatible middleware for monetizing API endpoints.
 * Supports both x402 and MPP (Machine Payment Protocol) standards.
 *
 * @example
 * ```ts
 * import { createPaymentGate } from '@asgcard/pay/server';
 *
 * app.post('/api/premium',
 *   createPaymentGate({
 *     payTo: '0xYOUR_WALLET',
 *     amount: '500000',  // 0.50 USDC
 *     asset: 'USDC',
 *     network: 'eip155:8453',
 *   }),
 *   (req, res) => { res.json({ data: 'premium content' }); }
 * );
 * ```
 */
export { createX402Gate, type X402GateConfig } from './x402-gate';
export { createMppGate, type MppGateConfig } from './mpp-gate';
export { createPaymentGate, type PaymentGateConfig } from './payment-gate';
export { createWebhookHandler, type WebhookConfig } from './webhook';
export { buildReceipt, type ReceiptOptions, type PaymentReceipt } from './receipt';
