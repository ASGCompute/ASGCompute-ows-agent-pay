import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStellarWatcher } from '../monitor/stellar-watcher';

describe('createStellarWatcher', () => {
  let unsubFn: (() => void) | null = null;

  afterEach(() => {
    unsubFn?.();
    unsubFn = null;
    vi.restoreAllMocks();
  });

  it('returns an unsubscribe function', () => {
    // Mock fetch to return a pending response that never resolves (simulates SSE)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: () => new Promise(() => {}), // Never resolves — simulates waiting for events
        }),
      },
    } as any));

    unsubFn = createStellarWatcher({
      accountId: 'GABCDEFGHIJKLMNOP',
      onPayment: () => {},
    });

    expect(typeof unsubFn).toBe('function');
  });

  it('processes incoming payment events from SSE stream', async () => {
    const payments: any[] = [];

    const paymentRecord = JSON.stringify({
      id: '12345',
      type: 'payment',
      paging_token: '12345',
      transaction_hash: 'tx_stellar_123',
      from: 'GSENDER_ACCOUNT',
      to: 'GABCDEFGHIJKLMNOP',
      amount: '100.0000000',
      asset_type: 'native',
      created_at: '2026-01-01T00:00:00Z',
    });

    const sseData = `data: ${paymentRecord}\n\n`;
    let readCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            readCount++;
            if (readCount === 1) {
              return { done: false, value: new TextEncoder().encode(sseData) };
            }
            // Return done after first event
            return { done: true, value: undefined };
          },
        }),
      },
    } as any));

    unsubFn = createStellarWatcher({
      accountId: 'GABCDEFGHIJKLMNOP',
      onPayment: (event) => payments.push(event),
    });

    await new Promise((r) => setTimeout(r, 200));

    expect(payments.length).toBe(1);
    expect(payments[0].asset).toBe('XLM');
    expect(payments[0].chain).toBe('Stellar');
    expect(payments[0].transactionHash).toBe('tx_stellar_123');
    expect(payments[0].amountFormatted).toBe('100.0000000');
  });

  it('filters by asset when specified', async () => {
    const payments: any[] = [];

    const xmlPayment = JSON.stringify({
      id: '1', type: 'payment', paging_token: '1',
      transaction_hash: 'tx1', from: 'GSENDER', to: 'GACCOUNT',
      amount: '50', asset_type: 'native', created_at: '2026-01-01T00:00:00Z',
    });

    const usdcPayment = JSON.stringify({
      id: '2', type: 'payment', paging_token: '2',
      transaction_hash: 'tx2', from: 'GSENDER', to: 'GACCOUNT',
      amount: '25', asset_type: 'credit_alphanum4', asset_code: 'USDC',
      asset_issuer: 'GA5Z', created_at: '2026-01-01T00:00:00Z',
    });

    const sseData = `data: ${xmlPayment}\n\ndata: ${usdcPayment}\n\n`;
    let readCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            readCount++;
            if (readCount === 1) {
              return { done: false, value: new TextEncoder().encode(sseData) };
            }
            return { done: true, value: undefined };
          },
        }),
      },
    } as any));

    unsubFn = createStellarWatcher({
      accountId: 'GACCOUNT',
      asset: 'USDC',
      onPayment: (event) => payments.push(event),
    });

    await new Promise((r) => setTimeout(r, 200));

    expect(payments.length).toBe(1);
    expect(payments[0].asset).toBe('USDC');
  });

  it('calls onError when Horizon returns non-200', async () => {
    const errors: Error[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as any));

    unsubFn = createStellarWatcher({
      accountId: 'GINVALID',
      onPayment: () => {},
      onError: (err) => errors.push(err),
    });

    await new Promise((r) => setTimeout(r, 200));

    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toContain('404');
  });

  it('ignores outgoing payments (from === accountId)', async () => {
    const payments: any[] = [];

    const outgoing = JSON.stringify({
      id: '1', type: 'payment', paging_token: '1',
      transaction_hash: 'tx1', from: 'GACCOUNT', to: 'GOTHER',
      amount: '50', asset_type: 'native', created_at: '2026-01-01T00:00:00Z',
    });

    let readCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            readCount++;
            if (readCount === 1) {
              return { done: false, value: new TextEncoder().encode(`data: ${outgoing}\n\n`) };
            }
            return { done: true, value: undefined };
          },
        }),
      },
    } as any));

    unsubFn = createStellarWatcher({
      accountId: 'GACCOUNT',
      onPayment: (event) => payments.push(event),
    });

    await new Promise((r) => setTimeout(r, 200));
    expect(payments.length).toBe(0);
  });

  it('logs with custom logger', async () => {
    const logs: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
    } as any));

    unsubFn = createStellarWatcher({
      accountId: 'GACCOUNT',
      onPayment: () => {},
      logger: (msg) => logs.push(msg),
    });

    await new Promise((r) => setTimeout(r, 100));
    unsubFn();
    unsubFn = null;

    expect(logs.some((l) => l.includes('Connecting'))).toBe(true);
  });
});
