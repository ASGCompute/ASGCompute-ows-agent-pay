import { describe, it, expect } from 'vitest';
import {
  parseMppChallenge,
  parseMppChallenges,
  decodeChallengeRequest,
  buildMppCredential,
  buildAuthorizationHeader,
  parseMppReceipt,
  detectProtocol,
  extractMppChallenges,
  base64urlEncode,
  base64urlDecode,
} from '../mpp';

// ─── Base64url ──────────────────────────────────────────────────────

describe('base64url', () => {
  it('encodes and decodes roundtrip', () => {
    const original = '{"amount":"1000","currency":"usd"}';
    const encoded = base64urlEncode(original);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
    expect(base64urlDecode(encoded)).toBe(original);
  });

  it('handles special characters', () => {
    const input = 'hello+world/test==';
    expect(base64urlDecode(base64urlEncode(input))).toBe(input);
  });

  it('handles empty string', () => {
    expect(base64urlDecode(base64urlEncode(''))).toBe('');
  });
});

// ─── Challenge parsing ──────────────────────────────────────────────

describe('parseMppChallenge', () => {
  const validHeader = 'Payment id="qB3wErTyU7iOpAsD9fGhJk", realm="mpp.dev", method="stripe", intent="charge", expires="2025-01-15T12:05:00Z", request="eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJ1c2QifQ"';

  it('parses a valid challenge header', () => {
    const challenge = parseMppChallenge(validHeader);
    expect(challenge.id).toBe('qB3wErTyU7iOpAsD9fGhJk');
    expect(challenge.realm).toBe('mpp.dev');
    expect(challenge.method).toBe('stripe');
    expect(challenge.intent).toBe('charge');
    expect(challenge.expires).toBe('2025-01-15T12:05:00Z');
    expect(challenge.request).toBe('eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJ1c2QifQ');
  });

  it('parses without "Payment " prefix', () => {
    const raw = 'id="abc", realm="test.com", method="tempo", intent="session", request="dGVzdA"';
    const challenge = parseMppChallenge(raw);
    expect(challenge.id).toBe('abc');
    expect(challenge.method).toBe('tempo');
    expect(challenge.intent).toBe('session');
  });

  it('throws on missing required field: id', () => {
    expect(() =>
      parseMppChallenge('Payment realm="x", method="stripe", intent="charge", request="x"')
    ).toThrow(/id/);
  });

  it('throws on missing required field: method', () => {
    expect(() =>
      parseMppChallenge('Payment id="x", realm="x", intent="charge", request="x"')
    ).toThrow(/method/);
  });

  it('throws on missing required field: request', () => {
    expect(() =>
      parseMppChallenge('Payment id="x", realm="x", method="stripe", intent="charge"')
    ).toThrow(/request/);
  });

  it('handles optional description field', () => {
    const header = 'Payment id="x", realm="test", method="stripe", intent="charge", request="dGVzdA", description="API access"';
    const c = parseMppChallenge(header);
    expect(c.description).toBe('API access');
  });

  it('handles missing optional fields gracefully', () => {
    const header = 'Payment id="x", realm="test", method="stripe", intent="charge", request="dGVzdA"';
    const c = parseMppChallenge(header);
    expect(c.expires).toBeUndefined();
    expect(c.description).toBeUndefined();
  });
});

describe('parseMppChallenges', () => {
  it('parses multiple headers', () => {
    const headers = [
      'Payment id="a", realm="x", method="stripe", intent="charge", request="dGVzdA"',
      'Payment id="b", realm="x", method="tempo", intent="charge", request="dGVzdA"',
    ];
    const challenges = parseMppChallenges(headers);
    expect(challenges).toHaveLength(2);
    expect(challenges[0].method).toBe('stripe');
    expect(challenges[1].method).toBe('tempo');
  });
});

// ─── Challenge request decoding ─────────────────────────────────────

describe('decodeChallengeRequest', () => {
  it('decodes base64url request object', () => {
    const requestObj = { amount: '1000', currency: 'usd', recipient: '0xabc' };
    const encoded = base64urlEncode(JSON.stringify(requestObj));
    const challenge = {
      id: 'test', realm: 'test', method: 'stripe' as const,
      intent: 'charge' as const, request: encoded,
    };
    const decoded = decodeChallengeRequest(challenge);
    expect(decoded.amount).toBe('1000');
    expect(decoded.currency).toBe('usd');
    expect(decoded.recipient).toBe('0xabc');
  });

  it('handles methodDetails in request', () => {
    const requestObj = {
      amount: '500', currency: 'usd',
      methodDetails: { networkId: 'net-123', paymentMethodTypes: ['card', 'link'] },
    };
    const encoded = base64urlEncode(JSON.stringify(requestObj));
    const challenge = {
      id: 'test', realm: 'test', method: 'stripe' as const,
      intent: 'charge' as const, request: encoded,
    };
    const decoded = decodeChallengeRequest(challenge);
    expect(decoded.methodDetails?.networkId).toBe('net-123');
    expect(decoded.methodDetails?.paymentMethodTypes).toEqual(['card', 'link']);
  });
});

// ─── Credential building ────────────────────────────────────────────

describe('buildMppCredential', () => {
  it('builds a valid base64url credential', () => {
    const challenge = {
      id: 'ch_123', realm: 'pay.asgcard.dev', method: 'stripe' as const,
      intent: 'charge' as const, request: base64urlEncode('{"amount":"100"}'),
    };
    const credential = buildMppCredential(
      challenge,
      'did:pkh:stripe:acct_123',
      { spt: 'spt_test_abc' }
    );
    // Should be base64url
    expect(credential).not.toContain('+');
    expect(credential).not.toContain('/');
    // Should decode to valid JSON
    const decoded = JSON.parse(base64urlDecode(credential));
    expect(decoded.challenge.id).toBe('ch_123');
    expect(decoded.source).toBe('did:pkh:stripe:acct_123');
    expect(decoded.payload.spt).toBe('spt_test_abc');
  });
});

describe('buildAuthorizationHeader', () => {
  it('builds "Payment <token>" format', () => {
    const challenge = {
      id: 'ch_123', realm: 'test', method: 'stripe' as const,
      intent: 'charge' as const, request: 'dGVzdA',
    };
    const header = buildAuthorizationHeader(challenge, 'source', { spt: 'spt_x' });
    expect(header).toMatch(/^Payment [A-Za-z0-9_-]+$/);
  });
});

// ─── Receipt parsing ────────────────────────────────────────────────

describe('parseMppReceipt', () => {
  it('parses a base64url receipt', () => {
    const receiptObj = { status: 'paid', piId: 'pi_123' };
    const encoded = base64urlEncode(JSON.stringify(receiptObj));
    const receipt = parseMppReceipt(encoded);
    expect(receipt.status).toBe('paid');
    expect(receipt.piId).toBe('pi_123');
  });

  it('returns raw for invalid base64', () => {
    const receipt = parseMppReceipt('not-valid-base64!!!');
    expect(receipt.raw).toBe('not-valid-base64!!!');
  });
});

// ─── Protocol detection ─────────────────────────────────────────────

describe('detectProtocol', () => {
  it('detects MPP from WWW-Authenticate header', () => {
    const result = detectProtocol({
      'www-authenticate': 'Payment id="abc", realm="test", method="stripe", intent="charge", request="x"',
    });
    expect(result).toBe('mpp');
  });

  it('detects MPP from array of headers', () => {
    const result = detectProtocol({
      'www-authenticate': [
        'Payment id="a", realm="test", method="stripe", intent="charge", request="x"',
        'Payment id="b", realm="test", method="tempo", intent="charge", request="x"',
      ],
    });
    expect(result).toBe('mpp');
  });

  it('detects x402 from body', () => {
    const result = detectProtocol({}, { x402Version: 2, accepts: [] });
    expect(result).toBe('x402');
  });

  it('returns unknown for unrecognized format', () => {
    expect(detectProtocol({}, {})).toBe('unknown');
    expect(detectProtocol({})).toBe('unknown');
  });

  it('prefers MPP over x402 when both present', () => {
    const result = detectProtocol(
      { 'www-authenticate': 'Payment id="x", realm="x", method="stripe", intent="charge", request="x"' },
      { x402Version: 2, accepts: [] }
    );
    expect(result).toBe('mpp');
  });
});

// ─── extractMppChallenges ───────────────────────────────────────────

describe('extractMppChallenges', () => {
  it('extracts challenges from single header', () => {
    const challenges = extractMppChallenges({
      'www-authenticate': 'Payment id="abc", realm="test", method="stripe", intent="charge", request="x"',
    });
    expect(challenges).toHaveLength(1);
    expect(challenges[0].method).toBe('stripe');
  });

  it('extracts challenges from multiple headers', () => {
    const challenges = extractMppChallenges({
      'www-authenticate': [
        'Payment id="a", realm="t", method="stripe", intent="charge", request="x"',
        'Payment id="b", realm="t", method="tempo", intent="session", request="y"',
      ],
    });
    expect(challenges).toHaveLength(2);
  });

  it('filters out non-Payment auth schemes', () => {
    const challenges = extractMppChallenges({
      'www-authenticate': [
        'Basic realm="test"',
        'Payment id="a", realm="t", method="stripe", intent="charge", request="x"',
      ],
    });
    expect(challenges).toHaveLength(1);
  });

  it('returns empty array when no headers', () => {
    expect(extractMppChallenges({})).toEqual([]);
  });
});
