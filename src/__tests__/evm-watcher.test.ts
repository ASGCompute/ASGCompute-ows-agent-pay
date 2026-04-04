import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEvmWatcher, type EvmWatcherConfig } from '../monitor/evm-watcher';

describe('createEvmWatcher', () => {
  let unsubFn: (() => void) | null = null;

  afterEach(() => {
    unsubFn?.();
    unsubFn = null;
    vi.restoreAllMocks();
  });

  it('returns an unsubscribe function', () => {
    // Mock fetch to return a block number
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0xa' }),
    } as any);

    const config: EvmWatcherConfig = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      rpcUrl: 'https://mock-rpc.test',
      pollIntervalMs: 100000, // Very long to prevent actual polling
      onPayment: () => {},
    };

    unsubFn = createEvmWatcher(config);
    expect(typeof unsubFn).toBe('function');
  });

  it('calls onPayment when ERC-20 transfer detected', async () => {
    const payments: any[] = [];
    let callCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      const body = JSON.parse((options as any).body);
      callCount++;

      if (body.method === 'eth_blockNumber') {
        // First call returns block 10, subsequent returns 11
        const block = callCount <= 1 ? 10 : 11;
        return { json: async () => ({ result: '0x' + block.toString(16) }) } as any;
      }

      if (body.method === 'eth_getLogs') {
        return {
          json: async () => ({
            result: [{
              data: '0x00000000000000000000000000000000000000000000000000000000000f4240', // 1000000 = 1 USDC
              topics: [
                '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                '0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // from
                '0x0000000000000000000000001234567890abcdef1234567890abcdef12345678', // to
              ],
              transactionHash: '0xtx123',
            }],
          }),
        } as any;
      }

      if (body.method === 'eth_getBlockByNumber') {
        return { json: async () => ({ result: { transactions: [], timestamp: '0x60000000' } }) } as any;
      }

      return { json: async () => ({ result: null }) } as any;
    });

    const config: EvmWatcherConfig = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      rpcUrl: 'https://mock-rpc.test',
      usdcContractAddress: '0xUSDC',
      pollIntervalMs: 50,
      onPayment: (event) => payments.push(event),
    };

    unsubFn = createEvmWatcher(config);

    // Wait for two poll cycles
    await new Promise((r) => setTimeout(r, 200));
    unsubFn();
    unsubFn = null;

    expect(payments.length).toBeGreaterThanOrEqual(1);
    expect(payments[0].asset).toBe('USDC');
    expect(payments[0].amount).toBe('1000000');
    expect(payments[0].amountFormatted).toBe('1.000000');
  });

  it('calls onError when RPC fails', async () => {
    const errors: Error[] = [];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ error: { message: 'rate limited' } }),
    } as any);

    const config: EvmWatcherConfig = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      rpcUrl: 'https://mock-rpc.test',
      pollIntervalMs: 50,
      onPayment: () => {},
      onError: (err) => errors.push(err),
    };

    unsubFn = createEvmWatcher(config);
    await new Promise((r) => setTimeout(r, 200));
    unsubFn();
    unsubFn = null;

    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toContain('rate limited');
  });

  it('stops polling after unsubscribe', async () => {
    let rpcCalls = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      rpcCalls++;
      return { json: async () => ({ result: '0xa' }) } as any;
    });

    unsubFn = createEvmWatcher({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      rpcUrl: 'https://mock-rpc.test',
      pollIntervalMs: 30,
      onPayment: () => {},
    });

    await new Promise((r) => setTimeout(r, 100));
    const callsBeforeStop = rpcCalls;
    unsubFn();
    unsubFn = null;

    await new Promise((r) => setTimeout(r, 150));
    expect(rpcCalls).toBeLessThanOrEqual(callsBeforeStop + 1); // At most 1 more in-flight
  });

  it('logs watcher startup with custom logger', async () => {
    const logs: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ result: '0xa' }),
    } as any);

    unsubFn = createEvmWatcher({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      rpcUrl: 'https://mock-rpc.test',
      pollIntervalMs: 100000,
      chainName: 'TestChain',
      onPayment: () => {},
      logger: (msg) => logs.push(msg),
    });

    await new Promise((r) => setTimeout(r, 100));
    unsubFn();
    unsubFn = null;

    expect(logs.some((l) => l.includes('Started watching'))).toBe(true);
    expect(logs.some((l) => l.includes('Stopped'))).toBe(true);
  });
});
