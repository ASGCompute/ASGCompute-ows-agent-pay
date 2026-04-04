# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] — 2026-04-04

### 🚀 Pay In Infrastructure (NEW)

This release transforms ASG Pay from a spending-only SDK into a **bi-directional A2A payment powerhouse**.

#### Server-Side 402 Gating (`src/server/`)
- **x402Gate** — x402 JSON challenge middleware with `X-PAYMENT` proof validation
- **MppGate** — MPP `WWW-Authenticate` middleware with credential validation
- **PaymentGate** — Dual-protocol unified gate (auto-detects x402 vs MPP)
- **WebhookHandler** — Stripe HMAC-SHA256 verification with idempotency guard
- **ReceiptBuilder** — Payment-Receipt header builder/parser

#### Real-Time Payment Monitoring (`src/monitor/`)
- **EvmWatcher** — JSON-RPC polling for ERC-20 Transfer events + native ETH
- **StellarWatcher** — Horizon SSE streaming for incoming payments
- **SolanaWatcher** — `getSignaturesForAddress` polling with tx parsing
- **MultiChainWatcher** — Unified cross-chain aggregator

#### Payment Request URIs (`src/requests/`)
- **EIP-681** — Ethereum payment URI generator
- **SEP-7** — Stellar payment URI generator
- **Solana Pay** — Solana payment URI generator
- **Universal** — Chain-agnostic router

### 📈 Quality
- Tests: **175 → 269** (+94 new tests)
- Coverage: **~76% → 84.38%** (80% enforced in CI)
- 19 new production files
- Zero new dependencies

### 🔧 Breaking Changes
- None — all new `PaymentAdapter` methods are optional for backward compatibility

---

## [0.1.2] — 2026-04-03

### Changed
- World-class README redesign with hero banner, architecture diagram, ecosystem showcase
- Added CI pipeline with Node 18/20/22 matrix
- Added CONTRIBUTING.md, SECURITY.md, issue templates

## [0.1.1] — 2026-03-28

### Added
- Full Stellar payment adapter (XLM + USDC, auto trustline)
- MPP protocol support (client-side challenge handling)
- Solana payment adapter (SOL + USDC SPL, auto ATA)
- Policy engine with 4 fail-closed gates

## [0.1.0] — 2026-03-20

### Added
- Initial release
- EVM payment adapter (10 chains, native + USDC)
- x402 protocol support
- Stripe MPP adapter
- OwsClient with dual-protocol 402 handling
