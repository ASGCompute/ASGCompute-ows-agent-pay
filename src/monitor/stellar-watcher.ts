import type { IncomingPayment, Unsubscribe } from '../adapters/types';
import { Logger, noopLogger } from '../logger';

/**
 * Stellar Watcher — monitors incoming payments via Horizon SSE.
 *
 * Uses the Horizon `/payments` endpoint with Server-Sent Events (SSE)
 * to receive real-time notifications of incoming payments.
 */
export interface StellarWatcherConfig {
  /** Stellar account to monitor. */
  accountId: string;
  /** Horizon server URL. Default: 'https://horizon.stellar.org'. */
  horizonUrl?: string;
  /** Asset filter: 'USDC', 'XLM', or 'all'. Default: 'all'. */
  asset?: string;
  /** Cursor to resume from (paging_token). If omitted, starts from 'now'. */
  cursor?: string;
  /** Callback for detected incoming payments. */
  onPayment: (event: IncomingPayment) => void;
  /** Callback for errors. */
  onError?: (error: Error) => void;
  /** Logger function. */
  logger?: Logger;
}

interface StellarPaymentRecord {
  id: string;
  type: string;
  paging_token: string;
  transaction_hash: string;
  from: string;
  to: string;
  amount: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  created_at: string;
}

/**
 * Creates a Stellar payment watcher using Horizon SSE streaming.
 *
 * Listens for `payment` and `create_account` operations directed
 * to the target account. Supports asset-based filtering.
 *
 * @returns Unsubscribe function to stop watching.
 */
export function createStellarWatcher(config: StellarWatcherConfig): Unsubscribe {
  const log = config.logger ?? noopLogger;
  const horizonUrl = config.horizonUrl ?? 'https://horizon.stellar.org';
  const assetFilter = config.asset ?? 'all';
  const cursor = config.cursor ?? 'now';

  let abortController: AbortController | null = null;
  let running = true;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  async function startStream() {
    if (!running) return;

    const url = `${horizonUrl}/accounts/${config.accountId}/payments?cursor=${cursor}&order=asc`;

    log(`[stellar-watcher] 🔍 Connecting to Horizon SSE: ${config.accountId.slice(0, 10)}…`);

    abortController = new AbortController();

    try {
      const response = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Horizon HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body for SSE stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      log(`[stellar-watcher] ✅ SSE connected, watching for payments…`);

      while (running) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentData = '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            currentData += line.slice(6);
          } else if (line === '' && currentData) {
            // End of event — process
            if (currentData !== '"hello"' && currentData !== 'hello') {
              processEvent(currentData);
            }
            currentData = '';
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        log('[stellar-watcher] 🛑 Stream aborted');
        return;
      }

      log(`[stellar-watcher] ❌ Stream error: ${err.message}`);
      config.onError?.(err);

      // Reconnect after 5s
      if (running) {
        log('[stellar-watcher] 🔄 Reconnecting in 5s…');
        reconnectTimer = setTimeout(startStream, 5000);
      }
    }
  }

  function processEvent(data: string) {
    try {
      const record: StellarPaymentRecord = JSON.parse(data);

      // Only process payments TO this account
      if (record.to !== config.accountId) return;

      // Only process payment operations
      if (record.type !== 'payment' && record.type !== 'create_account') return;

      // Determine asset
      const asset = record.asset_type === 'native'
        ? 'XLM'
        : record.asset_code || 'unknown';

      // Apply asset filter
      if (assetFilter !== 'all' && asset !== assetFilter) return;

      // Convert amount to atomic units (stroops = amount * 10^7)
      const atomicAmount = Math.round(parseFloat(record.amount) * 10_000_000).toString();

      const payment: IncomingPayment = {
        amount: atomicAmount,
        amountFormatted: record.amount,
        asset,
        from: record.from,
        transactionHash: record.transaction_hash,
        chain: 'Stellar',
        caip2Id: 'stellar:pubnet',
        timestamp: new Date(record.created_at),
      };

      log(`[stellar-watcher] 💰 Incoming: ${record.amount} ${asset} from ${record.from.slice(0, 10)}…`);
      config.onPayment(payment);
    } catch (err: any) {
      log(`[stellar-watcher] ⚠️ Failed to parse event: ${err.message}`);
    }
  }

  // Start the stream
  startStream();

  // Return unsubscribe
  return () => {
    running = false;
    abortController?.abort();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    log(`[stellar-watcher] 🛑 Stopped watching ${config.accountId.slice(0, 10)}…`);
  };
}
