/**
 * MPP — Machine Payments Protocol utilities.
 *
 * Handles parsing/building of MPP-standard headers:
 *   - WWW-Authenticate: Payment (Challenge)
 *   - Authorization: Payment (Credential)
 *   - Payment-Receipt (Receipt)
 *
 * @see https://mpp.dev/protocol/challenges
 * @see https://mpp.dev/protocol/credentials
 * @see https://mpp.dev/protocol/receipts
 * @see https://paymentauth.org — IETF specification
 */

// ─── Types ──────────────────────────────────────────────────────────

/** Supported MPP payment methods */
export type MppMethod = 'stripe' | 'tempo' | 'card' | 'lightning' | 'solana' | 'stellar' | string;

/** Payment intent types */
export type MppIntent = 'charge' | 'session';

/**
 * Parsed MPP Challenge from `WWW-Authenticate: Payment` header.
 */
export interface MppChallenge {
  /** Unique challenge ID (cryptographically bound to parameters) */
  id: string;
  /** Server realm (e.g. "mpp.dev", "pay.asgcard.dev") */
  realm: string;
  /** Payment method identifier */
  method: MppMethod;
  /** Payment intent type */
  intent: MppIntent;
  /** Base64url-encoded JSON with method-specific payment details */
  request: string;
  /** ISO 8601 expiration timestamp (optional) */
  expires?: string;
  /** Human-readable description (optional) */
  description?: string;
}

/**
 * Decoded request object from Challenge.
 */
export interface MppRequestObject {
  /** Amount in smallest currency unit (string for precision) */
  amount: string;
  /** Currency code (e.g. "usd") or token address */
  currency: string;
  /** Recipient address or Stripe account */
  recipient?: string;
  /** Decimal places for the currency */
  decimals?: number;
  /** Human-readable description */
  description?: string;
  /** External reference ID */
  externalId?: string;
  /** Method-specific details */
  methodDetails?: {
    networkId?: string;
    paymentMethodTypes?: string[];
    metadata?: Record<string, string>;
    [key: string]: unknown;
  };
}

/**
 * MPP Credential — sent in `Authorization: Payment` header.
 */
export interface MppCredential {
  /** Echo of the original challenge */
  challenge: MppChallenge;
  /** DID or identifier of the paying entity */
  source: string;
  /** Method-specific payload */
  payload: MppStripePayload | MppTempoPayload | Record<string, unknown>;
}

/** Stripe-specific credential payload */
export interface MppStripePayload {
  /** Shared Payment Token ID */
  spt: string;
  /** Optional external reference ID */
  externalId?: string;
}

/** Tempo-specific credential payload */
export interface MppTempoPayload {
  type: 'transaction' | 'hash' | 'proof';
  signature?: string;
  hash?: string;
}

/**
 * MPP Receipt — returned in `Payment-Receipt` header.
 */
export interface MppReceipt {
  /** Receipt data (base64url-decoded JSON) */
  [key: string]: unknown;
}

// ─── Base64url helpers ──────────────────────────────────────────────

/**
 * Encode string to base64url (RFC 4648 §5).
 * No padding, URL-safe alphabet.
 */
export function base64urlEncode(str: string): string {
  const b64 = Buffer.from(str, 'utf-8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode base64url string.
 */
export function base64urlDecode(str: string): string {
  // Restore standard base64
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding
  while (b64.length % 4 !== 0) b64 += '=';
  return Buffer.from(b64, 'base64').toString('utf-8');
}

// ─── Challenge parsing ──────────────────────────────────────────────

/**
 * Parse a `WWW-Authenticate: Payment` header value into an MppChallenge.
 *
 * Format:
 * ```
 * Payment id="abc", realm="mpp.dev", method="stripe", intent="charge",
 *   expires="2025-01-15T12:05:00Z", request="eyJhbW91bnQ..."
 * ```
 *
 * @param header — Raw header value (with or without "Payment " prefix)
 * @returns Parsed challenge object
 * @throws Error if required fields are missing
 */
export function parseMppChallenge(header: string): MppChallenge {
  // Strip "Payment " prefix if present
  let raw = header.trim();
  if (raw.startsWith('Payment ')) {
    raw = raw.slice(8);
  }

  // Parse RFC 7235 auth-param format: key="value", key="value"
  const params = parseAuthParams(raw);

  // Validate required fields
  const required = ['id', 'realm', 'method', 'intent', 'request'] as const;
  for (const key of required) {
    if (!params[key]) {
      throw new Error(`MPP Challenge missing required field: ${key}`);
    }
  }

  return {
    id: params.id!,
    realm: params.realm!,
    method: params.method! as MppMethod,
    intent: params.intent! as MppIntent,
    request: params.request!,
    expires: params.expires,
    description: params.description,
  };
}

/**
 * Parse multiple `WWW-Authenticate: Payment` headers.
 * Servers can offer multiple payment options.
 */
export function parseMppChallenges(headers: string[]): MppChallenge[] {
  return headers.map(parseMppChallenge);
}

/**
 * Decode the `request` field of a Challenge into a structured object.
 */
export function decodeChallengeRequest(challenge: MppChallenge): MppRequestObject {
  const json = base64urlDecode(challenge.request);
  return JSON.parse(json) as MppRequestObject;
}

// ─── Credential building ────────────────────────────────────────────

/**
 * Build an MPP Credential for the `Authorization: Payment` header.
 *
 * @param challenge — The challenge being responded to
 * @param source — DID or identifier of the payer
 * @param payload — Method-specific proof (SPT for Stripe, tx for Tempo)
 * @returns Base64url-encoded credential string
 */
export function buildMppCredential(
  challenge: MppChallenge,
  source: string,
  payload: MppCredential['payload']
): string {
  const credential: MppCredential = {
    challenge,
    source,
    payload,
  };
  return base64urlEncode(JSON.stringify(credential));
}

/**
 * Build the full `Authorization` header value.
 */
export function buildAuthorizationHeader(
  challenge: MppChallenge,
  source: string,
  payload: MppCredential['payload']
): string {
  return `Payment ${buildMppCredential(challenge, source, payload)}`;
}

// ─── Receipt parsing ────────────────────────────────────────────────

/**
 * Parse a `Payment-Receipt` header.
 */
export function parseMppReceipt(header: string): MppReceipt {
  try {
    const json = base64urlDecode(header.trim());
    return JSON.parse(json) as MppReceipt;
  } catch {
    return { raw: header };
  }
}

// ─── Protocol detection ─────────────────────────────────────────────

/**
 * Detect whether a 402 response uses MPP or x402 protocol.
 *
 * MPP: has `WWW-Authenticate: Payment` header
 * x402: has JSON body with `x402Version` and `accepts[]`
 */
export function detectProtocol(
  headers: Record<string, string | string[] | undefined>,
  body?: unknown
): 'mpp' | 'x402' | 'unknown' {
  // Check for MPP: WWW-Authenticate header with Payment scheme
  const wwwAuth = headers['www-authenticate'] || headers['WWW-Authenticate'];
  if (wwwAuth) {
    const values = Array.isArray(wwwAuth) ? wwwAuth : [wwwAuth];
    if (values.some((v) => v.trim().startsWith('Payment '))) {
      return 'mpp';
    }
  }

  // Check for x402: JSON body with x402Version
  if (body && typeof body === 'object' && ('x402Version' in (body as any) || 'accepts' in (body as any))) {
    return 'x402';
  }

  return 'unknown';
}

/**
 * Extract all MPP challenges from response headers.
 * Handles both single and multiple WWW-Authenticate headers.
 */
export function extractMppChallenges(
  headers: Record<string, string | string[] | undefined>
): MppChallenge[] {
  const wwwAuth = headers['www-authenticate'] || headers['WWW-Authenticate'];
  if (!wwwAuth) return [];

  const values = Array.isArray(wwwAuth) ? wwwAuth : [wwwAuth];
  return values
    .filter((v) => v.trim().startsWith('Payment '))
    .map(parseMppChallenge);
}

// ─── Internal helpers ───────────────────────────────────────────────

/**
 * Parse RFC 7235 auth-param format.
 * `key="value", key="value"`
 */
function parseAuthParams(raw: string): Record<string, string> {
  const params: Record<string, string> = {};

  // Match key="value" pairs, handling escaped quotes
  const regex = /(\w+)="((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const [, key, value] = match;
    // Unescape backslash-escaped characters
    params[key] = value.replace(/\\(.)/g, '$1');
  }

  return params;
}
