# Changelog

All notable changes to `@asgcard/pay` will be documented in this file.

## [0.1.1] — 2026-04-03

### 🔄 Major Rewrite — Real MPP Protocol Support

The `StripePaymentAdapter` has been completely rewritten to implement the real Machine Payments Protocol (MPP) as specified at [mpp.dev](https://mpp.dev/payment-methods/stripe).

### Added
- **`src/mpp.ts`** — Full MPP protocol utilities module
  - `parseMppChallenge()` — Parse `WWW-Authenticate: Payment` headers (RFC 7235)
  - `buildMppCredential()` — Build base64url-encoded credentials
  - `buildAuthorizationHeader()` — Build `Authorization: Payment` headers
  - `parseMppReceipt()` — Parse `Payment-Receipt` headers
  - `detectProtocol()` — Auto-detect MPP vs x402 from 402 responses
  - `extractMppChallenges()` — Extract multiple payment challenges
  - `base64urlEncode/Decode()` — RFC 4648 §5 helpers
- **Dual-protocol `OwsClient`** — Automatically detects and handles BOTH protocols:
  - **MPP**: `WWW-Authenticate: Payment` → `Authorization: Payment` flow
  - **x402**: JSON body → `X-PAYMENT` header flow
- **StripePaymentAdapter** — Full MPP lifecycle:
  - SPT creation via `POST /v1/test_helpers/shared_payment/granted_tokens` (test)
  - SPT creation via `POST /v1/shared_payment/issued_tokens` (production)
  - Challenge-bound credential generation
  - PaymentIntent creation with SPT for fallback mode
  - `buildServerChallenge()` for gating your own APIs
  - Autonomous mode (paymentMethodId) + Delegated mode (external SPT)
- **29 new tests** — MPP protocol (26) + Stripe adapter rewrite (3 new)

### Changed
- `StripePaymentAdapter.pay()` now returns base64url MPP credential (not PaymentIntent ID) when challenge is present
- `OwsClient` interceptor now checks `WWW-Authenticate` header before JSON body
- Challenge selection logic prefers adapter-matching payment method

### Test Results
- **125/125 tests passed** (was 96)
- TypeScript strict mode — PASS
- Dual CJS/ESM build — PASS

## [0.1.0] — 2026-04-03

### Added
- **OwsClient** — Axios-based HTTP client with autonomous 402 interceptor
- **PolicyEngine** — Fail-closed budget controller (per-tx limits, monthly cap, address whitelist)
- **EvmPaymentAdapter** — Universal EVM on-chain settlement via viem
  - **10 networks**: Base, Arbitrum, Optimism, Ethereum, Polygon (mainnet + testnet each)
  - Native token (ETH/MATIC) and USDC ERC-20 transfers
  - Circle official USDC contracts for 9/10 networks
  - `listEvmChains()` helper for runtime chain discovery
  - One adapter class for ALL EVM chains — no per-chain files
- **StripePaymentAdapter** — Machine Payments Protocol (MPP) settlement
  - Shared Payment Token (SPT) based fiat + stablecoin payments
  - PaymentIntent creation and confirmation
  - Live/test mode auto-detection from API key
  - `stripe` is an optional peer dependency (lazy-loaded)
  - `setSptToken()` for dynamic SPT updates
- **StellarPaymentAdapter** — On-chain settlement on Stellar
  - Native XLM payments
  - Circle USDC payments (native Stellar USDC)
  - Automatic trustline management
  - Mainnet + Testnet support
- **BasePaymentAdapter** — Legacy Base-only adapter (use `EvmPaymentAdapter` instead)
- **Silent-by-default logging** — opt-in via `logger: console.log`
- **Dual CJS/ESM build** — works with both `require()` and `import`
- **Full test suite** — 96 tests via Vitest (PolicyEngine, OwsClient, EvmPaymentAdapter, StripePaymentAdapter)
- **X-PAYMENT proof generation** — Base64-encoded JSON with CAIP-2 chain ID and tx hash

### Supported Protocols
- **x402** — HTTP 402 + on-chain settlement (Coinbase/Cloudflare)
- **MPP** — Machine Payments Protocol + Stripe SPTs (Stripe/Tempo)

### Supported Networks (13 total)

| Network | CAIP-2 | Asset | Protocol |
|---------|--------|-------|----------|
| Base | eip155:8453 | ETH/USDC | x402 |
| Base Sepolia | eip155:84532 | ETH/USDC | x402 |
| Arbitrum One | eip155:42161 | ETH/USDC | x402 |
| Arbitrum Sepolia | eip155:421614 | ETH/USDC | x402 |
| Optimism | eip155:10 | ETH/USDC | x402 |
| Optimism Sepolia | eip155:11155420 | ETH/USDC | x402 |
| Ethereum | eip155:1 | ETH/USDC | x402 |
| Ethereum Sepolia | eip155:11155111 | ETH/USDC | x402 |
| Polygon | eip155:137 | MATIC/USDC | x402 |
| Polygon Amoy | eip155:80002 | MATIC | x402 |
| Stellar Mainnet | stellar:pubnet | XLM/USDC | x402 |
| Stellar Testnet | stellar:testnet | XLM/USDC | x402 |
| Stripe (fiat) | stripe:live/test | USD/EUR/etc | MPP |
