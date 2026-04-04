import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSolanaWatcher } from '../monitor/solana-watcher';

describe('createSolanaWatcher', () => {
  let unsubFn: (() => void) | null = null;

  afterEach(() => {
    unsubFn?.();
    unsubFn = null;
    vi.restoreAllMocks();
  });

  it('returns an unsubscribe function', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ result: [] }),
    } as any);

    unsubFn = createSolanaWatcher({
      address: '7abc',
      rpcUrl: 'https://mock-solana.test',
      pollIntervalMs: 100000,
      onPayment: () => {},
    });

    expect(typeof unsubFn).toBe('function');
  });

  it('calls onPayment when SOL transfer detected', async () => {
    const payments: any[] = [];
    let callCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      const body = JSON.parse((options as any).body);
      callCount++;

      if (body.method === 'getSignaturesForAddress') {
        if (callCount <= 1) {
          // First poll — initial signatures
          return { json: async () => ({ result: [{ signature: 'sig_init', confirmationStatus: 'finalized' }] }) } as any;
        }
        // Second poll — new signature
        return { json: async () => ({ result: [{ signature: 'sig_new', confirmationStatus: 'finalized' }] }) } as any;
      }

      if (body.method === 'getTransaction') {
        return {
          json: async () => ({
            result: {
              blockTime: Math.floor(Date.now() / 1000),
              meta: { err: null, innerInstructions: [] },
              transaction: {
                message: {
                  instructions: [{
                    program: 'system',
                    parsed: {
                      type: 'transfer',
                      info: {
                        source: '8xyz',
                        destination: '7abc',
                        lamports: 1000000000, // 1 SOL
                      },
                    },
                  }],
                },
              },
            },
          }),
        } as any;
      }

      return { json: async () => ({ result: null }) } as any;
    });

    unsubFn = createSolanaWatcher({
      address: '7abc',
      rpcUrl: 'https://mock-solana.test',
      pollIntervalMs: 50,
      onPayment: (event) => payments.push(event),
    });

    await new Promise((r) => setTimeout(r, 300));
    unsubFn();
    unsubFn = null;

    expect(payments.length).toBeGreaterThanOrEqual(1);
    expect(payments[0].asset).toBe('SOL');
    expect(payments[0].chain).toBe('Solana');
  });

  it('calls onError when RPC fails', async () => {
    const errors: Error[] = [];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ error: { message: 'too many requests' } }),
    } as any);

    unsubFn = createSolanaWatcher({
      address: '7abc',
      rpcUrl: 'https://mock-solana.test',
      pollIntervalMs: 50,
      onPayment: () => {},
      onError: (err) => errors.push(err),
    });

    await new Promise((r) => setTimeout(r, 200));
    unsubFn();
    unsubFn = null;

    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it('stops polling after unsubscribe', async () => {
    let rpcCalls = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      rpcCalls++;
      return { json: async () => ({ result: [] }) } as any;
    });

    unsubFn = createSolanaWatcher({
      address: '7abc',
      rpcUrl: 'https://mock-solana.test',
      pollIntervalMs: 30,
      onPayment: () => {},
    });

    await new Promise((r) => setTimeout(r, 100));
    const callsBefore = rpcCalls;
    unsubFn();
    unsubFn = null;

    await new Promise((r) => setTimeout(r, 150));
    expect(rpcCalls).toBeLessThanOrEqual(callsBefore + 1);
  });

  it('logs with custom logger', async () => {
    const logs: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ result: [{ signature: 'sig_1', confirmationStatus: 'finalized' }] }),
    } as any);

    unsubFn = createSolanaWatcher({
      address: '7abc',
      rpcUrl: 'https://mock-solana.test',
      pollIntervalMs: 100000,
      onPayment: () => {},
      logger: (msg) => logs.push(msg),
    });

    await new Promise((r) => setTimeout(r, 100));
    unsubFn();
    unsubFn = null;

    expect(logs.some((l) => l.includes('Started watching') || l.includes('Stopped'))).toBe(true);
  });
});
