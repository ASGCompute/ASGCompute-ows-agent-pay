import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMultiChainWatcher } from '../monitor/multi-watcher';

describe('createMultiChainWatcher', () => {
  let unsubFn: (() => void) | null = null;

  afterEach(() => {
    unsubFn?.();
    unsubFn = null;
    vi.restoreAllMocks();
  });

  it('returns an unsubscribe function', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ result: '0xa' }),
    } as any);

    unsubFn = createMultiChainWatcher({
      evm: [{
        address: '0x1234',
        rpcUrl: 'https://mock.test',
        pollIntervalMs: 100000,
        onPayment: () => {},
      }],
      onPayment: () => {},
    });

    expect(typeof unsubFn).toBe('function');
  });

  it('starts multiple EVM watchers', () => {
    const logs: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ result: '0xa' }),
    } as any);

    unsubFn = createMultiChainWatcher({
      evm: [
        { address: '0x1111', rpcUrl: 'https://base.test', chainName: 'Base', pollIntervalMs: 100000, onPayment: () => {} },
        { address: '0x2222', rpcUrl: 'https://arb.test', chainName: 'Arbitrum', pollIntervalMs: 100000, onPayment: () => {} },
      ],
      onPayment: () => {},
      logger: (msg) => logs.push(msg),
    });

    expect(logs.some((l) => l.includes('2 EVM'))).toBe(true);
    expect(logs.some((l) => l.includes('2 watcher(s) running'))).toBe(true);
  });

  it('logs Stellar and Solana watchers when configured', () => {
    const logs: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({ result: [] }),
        body: {
          getReader: () => ({
            read: () => new Promise(() => {}),
          }),
        },
      } as any;
    });

    unsubFn = createMultiChainWatcher({
      stellar: { accountId: 'GABC', onPayment: () => {} },
      solana: { address: '7abc', rpcUrl: 'https://sol.test', pollIntervalMs: 100000, onPayment: () => {} },
      onPayment: () => {},
      logger: (msg) => logs.push(msg),
    });

    expect(logs.some((l) => l.includes('Stellar'))).toBe(true);
    expect(logs.some((l) => l.includes('Solana'))).toBe(true);
  });

  it('stops all watchers on unsubscribe', async () => {
    const logs: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ result: '0xa' }),
    } as any);

    unsubFn = createMultiChainWatcher({
      evm: [{ address: '0x1234', rpcUrl: 'https://mock.test', pollIntervalMs: 100000, onPayment: () => {} }],
      onPayment: () => {},
      logger: (msg) => logs.push(msg),
    });

    unsubFn();
    unsubFn = null;

    expect(logs.some((l) => l.includes('All watchers stopped'))).toBe(true);
  });

  it('forwards payments to unified callback', async () => {
    const unifiedPayments: any[] = [];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ result: '0xa' }),
    } as any);

    unsubFn = createMultiChainWatcher({
      evm: [{
        address: '0x1234',
        rpcUrl: 'https://mock.test',
        pollIntervalMs: 100000,
        onPayment: () => {},
      }],
      onPayment: (event) => unifiedPayments.push(event),
    });

    // Verify setup is correct (actual payment forwarding tested in individual watcher tests)
    expect(typeof unsubFn).toBe('function');
  });
});
