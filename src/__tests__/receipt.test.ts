import { describe, it, expect } from 'vitest';
import { buildReceipt, parseReceipt } from '../server/receipt';

describe('buildReceipt', () => {
  it('builds a base64url-encoded receipt', () => {
    const encoded = buildReceipt({
      challengeId: 'ch_123',
      status: 'settled',
      amount: '500000',
      asset: 'USDC',
      transactionHash: '0xabc123',
    });

    expect(encoded).toBeTruthy();
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('round-trips through parse', () => {
    const encoded = buildReceipt({
      challengeId: 'ch_456',
      status: 'settled',
      amount: '1000000',
      asset: 'USDC',
      transactionHash: '0xdef789',
    });

    const parsed = parseReceipt(encoded);
    expect(parsed.challengeId).toBe('ch_456');
    expect(parsed.status).toBe('settled');
    expect(parsed.amount).toBe('1000000');
    expect(parsed.asset).toBe('USDC');
    expect(parsed.transactionHash).toBe('0xdef789');
    expect(parsed.issuedAt).toBeTruthy();
  });

  it('omits transactionHash when not provided', () => {
    const encoded = buildReceipt({
      challengeId: 'ch_789',
      status: 'pending',
      amount: '100',
      asset: 'XLM',
    });

    const parsed = parseReceipt(encoded);
    expect(parsed.transactionHash).toBeUndefined();
    expect(parsed.status).toBe('pending');
  });

  it('uses provided timestamp', () => {
    const ts = new Date('2026-01-01T00:00:00Z');
    const encoded = buildReceipt({
      challengeId: 'ch_ts',
      status: 'settled',
      amount: '50',
      asset: 'ETH',
      timestamp: ts,
    });

    const parsed = parseReceipt(encoded);
    expect(parsed.issuedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('handles failed status', () => {
    const encoded = buildReceipt({
      challengeId: 'ch_fail',
      status: 'failed',
      amount: '0',
      asset: 'USDC',
    });

    const parsed = parseReceipt(encoded);
    expect(parsed.status).toBe('failed');
  });
});

describe('parseReceipt', () => {
  it('decodes standard base64url', () => {
    const receipt = { challengeId: 'test', status: 'settled', amount: '1', asset: 'USDC', issuedAt: '2026-01-01' };
    const encoded = Buffer.from(JSON.stringify(receipt))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const parsed = parseReceipt(encoded);
    expect(parsed.challengeId).toBe('test');
  });

  it('throws on invalid encoding', () => {
    expect(() => parseReceipt('!!invalid!!')).toThrow();
  });
});
