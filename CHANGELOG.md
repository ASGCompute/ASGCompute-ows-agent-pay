# Changelog

All notable changes to `@asgcard/pay` will be documented in this file.

## [0.1.2] — 2026-04-04

### 🚀 Solana Adapter + Production Stripe MPP

Full multi-chain coverage achieved: EVM (10) + Stellar (2) + Solana (2) + Stripe = **15 networks**.

### Added
- **`SolanaPaymentAdapter`** — Full Solana on-chain settlement
  - Native SOL transfers via System Program
  - USDC (SPL Token) transfers with automatic ATA creation
  - `getSolBalance()` / `getUsdcBalance()` — live RPC balance queries
  - `requestAirdrop()` — devnet/testnet faucet (blocked on mainnet)
  - Circle official USDC mints: mainnet `EPjFWdd5…` / devnet `4zMMC9…`
  - CAIP-2 identifiers: `solana:5eykt4…` (mainnet) / `solana:4uhcVJ…` (devnet)
- **18 new Solana unit tests** — SOL/USDC transfers, ATA, airdrop, balance checks
- **5 live Stripe integration tests** — real PaymentIntents on production Stripe API
  - Crypto deposit via Tempo, PI cancel, account verification

### Changed
- **Stripe MPP**: Verified live account `acct_1T6hdDPCMcovv6hJ` with MPP access
- Production environment variables set in Vercel for `pay.asgcard.dev`
- Barrel exports updated: `SolanaPaymentAdapter` + `SolanaAdapterOptions`

### Dependencies
- Added `@solana/web3.js` `^1.98.4`
- Added `@solana/spl-token` `^0.4.14`

### Test Results
- **148/148 tests passed** (was 125)
  - 44 EVM, 26 MPP, 25 Stripe, 20 Policy, 18 Solana, 10 Client, 5 Stripe Live

---

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
  - SPT creation via Stripe API (test + production endpoints)
  - Challenge-bound credential generation
  - `createCryptoPaymentIntent()` — Tempo network USDC deposits
  - `buildServerChallenge()` — Gate your own APIs with MPP 402
  - Autonomous mode (paymentMethodId) + Delegated mode (external SPT)
- **29 new tests** — MPP protocol (26) + Stripe adapter (3)

### Changed
- `StripePaymentAdapter.pay()` returns base64url MPP credential when challenge present
- `OwsClient` interceptor now checks `WWW-Authenticate` before JSON body
- Challenge selection logic prefers adapter-matching payment method

### Test Results
- **125/125 tests passed** (was 96)

---

## [0.1.0] — 2026-04-03

### 🎉 Initial Release

Production x402/MPP payment SDK for AI agents.

### Added
- **OwsClient** — Axios-based HTTP client with autonomous 402 interceptor
- **PolicyEngine** — Fail-closed budget controller (per-tx limits, monthly cap, whitelist)
- **EvmPaymentAdapter** — Universal EVM on-chain settlement via viem
  - 10 networks: Base, Arbitrum, Optimism, Ethereum, Polygon (mainnet + testnet)
  - Native token (ETH/MATIC) and USDC ERC-20 transfers
  - Circle official USDC contracts for 9/10 networks
- **StripePaymentAdapter** — Machine Payments Protocol (MPP) settlement
- **StellarPaymentAdapter** — Stellar XLM + USDC with trustline management
- **BasePaymentAdapter** — Legacy Base-only adapter (backward compat)
- Silent-by-default logging, dual CJS/ESM build

### Supported Protocols
- **x402** — HTTP 402 + on-chain settlement (Coinbase/Cloudflare)
- **MPP** — Machine Payments Protocol + Stripe SPTs (Stripe/Tempo)

### Supported Networks (13)

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
