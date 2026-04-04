import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import { createWebhookHandler, type WebhookConfig } from '../server/webhook';

function makePostRequest(
  server: http.Server,
  path: string,
  body: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port: addr.port,
        method: 'POST',
        path,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let body: any;
          try { body = JSON.parse(data); } catch { body = data; }
          resolve({ status: res.statusCode!, body });
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function generateStripeSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signedPayload = `${timestamp}.${payload}`;
  const hash = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${hash}`;
}

describe('createWebhookHandler', () => {
  let server: http.Server;
  const secret = 'whsec_test_secret_key_12345';

  afterEach(() => {
    server?.close();
  });

  async function startServer(config: WebhookConfig): Promise<http.Server> {
    const handler = createWebhookHandler(config);
    server = http.createServer(async (req, res) => {
      // Collect body
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        (req as any).body = body;
        await handler(req, res);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    return server;
  }

  it('rejects requests without stripe-signature header', async () => {
    await startServer({ signingSecret: secret });
    const res = await makePostRequest(server, '/webhook', { type: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('stripe-signature');
  });

  it('rejects invalid signature', async () => {
    await startServer({ signingSecret: secret });
    const res = await makePostRequest(server, '/webhook', { type: 'test' }, {
      'stripe-signature': 't=123,v1=invalidhex',
    });
    expect(res.status).toBe(400);
  });

  it('accepts valid signature and routes payment_intent.succeeded', async () => {
    const successHandler = vi.fn();
    await startServer({
      signingSecret: secret,
      onPaymentSuccess: successHandler,
    });

    const event = {
      id: 'evt_test_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_1',
          amount: 5000,
          currency: 'usd',
          metadata: {},
        },
      },
    };

    const payload = JSON.stringify(event);
    const sig = generateStripeSignature(payload, secret);

    const res = await makePostRequest(server, '/webhook', event, {
      'stripe-signature': sig,
    });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(successHandler).toHaveBeenCalledOnce();
    expect(successHandler.mock.calls[0][0].paymentIntentId).toBe('pi_test_1');
  });

  it('routes payment_intent.payment_failed', async () => {
    const failHandler = vi.fn();
    await startServer({
      signingSecret: secret,
      onPaymentFailure: failHandler,
    });

    const event = {
      id: 'evt_test_2',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_fail', amount: 1000, currency: 'usd' } },
    };

    const payload = JSON.stringify(event);
    const sig = generateStripeSignature(payload, secret);

    const res = await makePostRequest(server, '/webhook', event, {
      'stripe-signature': sig,
    });

    expect(res.status).toBe(200);
    expect(failHandler).toHaveBeenCalledOnce();
  });

  it('detects duplicate events via idempotency guard', async () => {
    const successHandler = vi.fn();
    const processedIds = new Set<string>();
    await startServer({
      signingSecret: secret,
      onPaymentSuccess: successHandler,
      processedEventIds: processedIds,
    });

    const event = {
      id: 'evt_duplicate',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_dup', amount: 100, currency: 'usd' } },
    };

    const payload = JSON.stringify(event);
    const sig = generateStripeSignature(payload, secret);

    // First request
    await makePostRequest(server, '/webhook', event, { 'stripe-signature': sig });
    expect(successHandler).toHaveBeenCalledOnce();

    // Re-sign for second request (timestamp changes)
    const sig2 = generateStripeSignature(payload, secret);
    const res2 = await makePostRequest(server, '/webhook', event, { 'stripe-signature': sig2 });
    expect(res2.status).toBe(200);
    expect(res2.body.duplicate).toBe(true);
    expect(successHandler).toHaveBeenCalledOnce(); // NOT called again
  });

  it('logs events when logger is provided', async () => {
    const logs: string[] = [];
    await startServer({
      signingSecret: secret,
      logger: (msg) => logs.push(msg),
    });

    const event = {
      id: 'evt_log',
      type: 'some.other.event',
      data: { object: {} },
    };

    const payload = JSON.stringify(event);
    const sig = generateStripeSignature(payload, secret);

    await makePostRequest(server, '/webhook', event, { 'stripe-signature': sig });
    expect(logs.some((l) => l.includes('Unhandled'))).toBe(true);
  });
});
