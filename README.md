<div align="center">

# ASG Pay

### Payment Infrastructure for Autonomous AI Agents

**15 Networks** • **x402 + MPP Protocols** • **Fail-Closed Policy Engine** • **Production-Ready**

[![npm version](https://img.shields.io/npm/v/@asgcard/pay?color=635bff)](https://www.npmjs.com/package/@asgcard/pay)
[![npm downloads](https://img.shields.io/npm/dm/@asgcard/pay?label=downloads&color=22c55e)](https://www.npmjs.com/package/@asgcard/pay)
[![Tests](https://img.shields.io/badge/tests-148%20passed-22c55e)](src/__tests__)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.json)

```bash
npm install @asgcard/pay
```

*Give your AI agent a wallet with rules. The agent calls `performTask()` — the SDK handles payment, policy, settlement, and proof generation transparently across 15 networks.*

[Documentation](https://pay.asgcard.dev) • [Live Demo](https://asgcompute.github.io/ASGCompute-ows-agent-pay/) • [Architecture](#architecture) • [Ecosystem](#ecosystem)

</div>

---

## What This Solves

AI agents are becoming autonomous workers, but they have no native way to **pay for services**. When an agent hits a paywall (HTTP 402), it stops. ASG Pay fixes this:

```
Agent → API request → 402 "Pay $0.50" → SDK auto-settles → Agent gets result
```

**Zero payment code in your agent.** The SDK intercepts 402 responses, validates spend against policy, settles on-chain (or via Stripe), and retries — all in one round-trip.

---

## Quick Start

```typescript
import { OwsClient, EvmPaymentAdapter } from '@asgcard/pay';

// Pick any chain: 'base', 'arbitrum', 'optimism', 'ethereum', 'polygon'
// Each has mainnet + testnet. Asset: 'native' or 'USDC'.
const adapter = new EvmPaymentAdapter({
  chain: 'base',
  asset: 'USDC',
  privateKey: process.env.AGENT_KEY as `0x${string}`,
});

const agent = new OwsClient({
  baseURL: 'https://api.example.com',
  policy: {
    maxAmountPerTransaction: 5,   // $5 max per call
    monthlyBudget: 100,           // $100/month total
  },
  adapter,
});

// Agent code — no payment logic needed
const result = await agent.performTask('/v1/inference', {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Summarize this document' }],
});
```

### Multi-Chain Examples

```typescript
// Stellar USDC (Mainnet)
import { StellarPaymentAdapter } from '@asgcard/pay';
const stellar = new StellarPaymentAdapter({
  secretKey: process.env.STELLAR_SECRET!,
  network: 'mainnet',
  asset: 'USDC',
});

// Solana (Devnet SOL or Mainnet USDC)
import { SolanaPaymentAdapter } from '@asgcard/pay';
const solana = new SolanaPaymentAdapter({
  secretKey: myKeypair.secretKey,
  network: 'mainnet-beta',
  asset: 'USDC',
});

// Stripe Machine Payments Protocol
import { StripePaymentAdapter } from '@asgcard/pay';
const stripe = new StripePaymentAdapter({
  stripeSecretKey: process.env.STRIPE_SECRET_KEY!,
  networkId: 'my-network',
});
```

---

## Architecture

```
                        ┌──────────────────┐
                        │    AI  Agent      │
                        │  performTask()    │
                        └────────┬─────────┘
                                 │ HTTP request
                        ┌────────▼─────────┐
                        │   OwsClient       │
                        │  (Axios + 402     │
                        │   interceptor)    │
                        └─┬──────────────┬──┘
              detect      │              │
         ┌────────────────▼──┐   ┌───────▼──────────────┐
         │  Protocol Router   │   │   PolicyEngine        │
         │                    │   │  ┌──────────────────┐ │
         │  WWW-Authenticate  │   │  │ Per-tx limit     │ │
         │  → MPP handler     │   │  │ Monthly budget   │ │
         │                    │   │  │ Dest whitelist   │ │
         │  JSON body x402    │   │  │ Fail-closed      │ │
         │  → x402 handler    │   │  └──────────────────┘ │
         └────────────────────┘   └───────────────────────┘
                                           │
                    ┌──────────────────────▼───────────────────┐
                    │          PaymentAdapter (interface)       │
                    ├──────────┬──────────┬──────────┬─────────┤
                    │   EVM    │ Stellar  │  Solana  │ Stripe  │
                    │ 10 chains│ XLM/USDC │ SOL/USDC │  MPP    │
                    │  viem    │ Horizon  │ web3.js  │  SPT    │
                    └──────────┴──────────┴──────────┴─────────┘
```

| Component | File | Purpose |
|-----------|------|---------|
| **OwsClient** | [`client.ts`](src/client.ts) | Dual-protocol HTTP client with autonomous 402 handling |
| **PolicyEngine** | [`policy.ts`](src/policy.ts) | Fail-closed budget controller (4 gates) |
| **MPP Protocol** | [`mpp.ts`](src/mpp.ts) | RFC 7235 challenge/credential parser + builder |
| **EvmPaymentAdapter** | [`adapters/evm.ts`](src/adapters/evm.ts) | 10 EVM chains — ETH/MATIC + USDC (Circle) |
| **StellarPaymentAdapter** | [`adapters/stellar.ts`](src/adapters/stellar.ts) | Stellar XLM + USDC with trustline management |
| **SolanaPaymentAdapter** | [`adapters/solana.ts`](src/adapters/solana.ts) | SOL + USDC SPL with auto ATA creation |
| **StripePaymentAdapter** | [`adapters/stripe.ts`](src/adapters/stripe.ts) | Stripe MPP — SPT lifecycle + crypto deposits |
| **PaymentAdapter** | [`adapters/types.ts`](src/adapters/types.ts) | Interface — add any chain in ~40 lines |

---

## Supported Networks (15)

### EVM Chains (10)

| Chain | CAIP-2 | USDC Contract | Status |
|-------|--------|---------------|--------|
| **Base** | `eip155:8453` | `0x8335…` (Circle) | ✅ Live |
| **Base Sepolia** | `eip155:84532` | `0x036C…` (Circle) | ✅ Testnet |
| **Arbitrum One** | `eip155:42161` | `0xaf88…` (Circle) | ✅ Live |
| **Arbitrum Sepolia** | `eip155:421614` | `0x75fa…` (Circle) | ✅ Testnet |
| **Optimism** | `eip155:10` | `0x0b2C…` (Circle) | ✅ Live |
| **Optimism Sepolia** | `eip155:11155420` | `0x5fd8…` (Circle) | ✅ Testnet |
| **Ethereum** | `eip155:1` | `0xA0b8…` (Circle) | ✅ Live |
| **Ethereum Sepolia** | `eip155:11155111` | `0x1c7D…` (Circle) | ✅ Testnet |
| **Polygon** | `eip155:137` | `0x3c49…` (Circle) | ✅ Live |
| **Polygon Amoy** | `eip155:80002` | — | ✅ Testnet |

### Stellar (2)

| Network | CAIP-2 | Assets | Status |
|---------|--------|--------|--------|
| **Stellar Mainnet** | `stellar:pubnet` | XLM, USDC (Circle) | ✅ Live |
| **Stellar Testnet** | `stellar:testnet` | XLM, USDC | ✅ Testnet |

### Solana (2)

| Network | CAIP-2 | Assets | Status |
|---------|--------|--------|--------|
| **Solana Mainnet** | `solana:5eykt4…` | SOL, USDC (Circle) | ✅ Live |
| **Solana Devnet** | `solana:4uhcVJ…` | SOL, USDC | ✅ Testnet |

### Stripe (1)

| Network | CAIP-2 | Settlement | Status |
|---------|--------|------------|--------|
| **Stripe MPP** | `stripe:live` | USD via SPT + Tempo USDC | ✅ Live |

---

## Dual Protocol Support

ASG Pay is the only SDK that natively supports **both** major machine payment protocols:

### x402 Protocol (Coinbase / Cloudflare)
```
Server → 402 + JSON { x402Version, accepts: [{ payTo, amount, asset }] }
Agent  → On-chain tx → X-PAYMENT header with proof
Server → 200 OK
```

### MPP — Machine Payments Protocol (Stripe)
```
Server → 402 + WWW-Authenticate: Payment id="…", method="stripe", request="…"
Agent  → Create SPT → Authorization: Payment <credential>
Server → 200 OK + Payment-Receipt header
```

---

## Policy Engine (Fail-Closed)

Every payment must pass **all four** gates before execution. If any gate fails → payment **silently rejected**. No override. No bypass.

```typescript
const policy = {
  maxAmountPerTransaction: 5,     // Gate 1: Per-transaction cap ($)
  monthlyBudget: 100,             // Gate 2: Rolling monthly budget ($)
  allowedDestinations: ['0x…'],   // Gate 3: Address whitelist (optional)
};
// Gate 4: Amount must be > 0 (implicit)
```

```
$10 request → ❌ REJECTED (exceeds per-tx $5 limit)
$3 to unknown addr → ❌ REJECTED (not in whitelist)
$3 to whitelisted addr → ✅ SETTLED
$3 after $98 spent → ❌ REJECTED (would exceed $100 budget)
```

---

## Testing

```bash
# Unit tests (no secrets needed)
npm test

# Full suite including live Stripe integration
STRIPE_SECRET_KEY=sk_live_… npm test
```

**148 tests** across 7 test files:

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `mpp.test.ts` | 26 | Challenge parsing, credential building, protocol detection |
| `policy.test.ts` | 20 | All 4 gates, budget tracking, reset, whitelist |
| `stripe.test.ts` | 25 | SPT creation, PI flow, challenge handling |
| `client.test.ts` | 10 | Dual-protocol 402 handling, retry logic |
| `solana.test.ts` | 18 | SOL/USDC transfers, ATA, airdrop protection |
| `evm.test.ts` | 44 | 10 chains, native + USDC, balance checks |
| `stripe.integration.test.ts` | 5 | **Live Stripe API** — real PaymentIntents |

---

## Ecosystem

ASG Pay is the payment engine powering the ASG Card ecosystem:

<table>
<tr>
<td width="33%" align="center">

### 💳 ASG Card
**Virtual Cards for AI Agents**

Issue virtual MasterCards on demand.
Fund via USDC on Stellar.

**[asgcard.dev](https://asgcard.dev)**

```bash
npx @asgcard/cli
```

</td>
<td width="33%" align="center">

### 💰 ASG Fund
**One-Link Agent Funding**

Top up any agent wallet with
credit card, bank, or crypto.

**[fund.asgcard.dev](https://fund.asgcard.dev)**

```bash
npm install @asgcard/fund
```

</td>
<td width="33%" align="center">

### ⚡ ASG Pay SDK
**Payment Infrastructure**

15 networks, 2 protocols,
fail-closed policy engine.

**[pay.asgcard.dev](https://pay.asgcard.dev)**

```bash
npm install @asgcard/pay
```

</td>
</tr>
</table>

### NPM Packages

| Package | Description |
|---------|-------------|
| [`@asgcard/pay`](https://www.npmjs.com/package/@asgcard/pay) | Core payment SDK — this repo |
| [`@asgcard/cli`](https://www.npmjs.com/package/@asgcard/cli) | Virtual card CLI |
| [`@asgcard/sdk`](https://www.npmjs.com/package/@asgcard/sdk) | Card management TypeScript SDK |
| [`@asgcard/mcp-server`](https://www.npmjs.com/package/@asgcard/mcp-server) | MCP server (11 tools for Claude/Codex) |
| [`@asgcard/fund`](https://www.npmjs.com/package/@asgcard/fund) | Payment link generator |

---

## Key Metrics

| Metric | Value |
|--------|-------|
| **Networks** | 15 (10 EVM + 2 Stellar + 2 Solana + Stripe) |
| **Protocols** | 2 (x402 + MPP) |
| **Tests** | 148 passed |
| **Source** | ~2,200 lines TypeScript |
| **Dependencies** | 5 (viem, axios, @stellar/stellar-sdk, @solana/web3.js, @solana/spl-token) |
| **Products Live** | 3 (pay, fund, card) |
| **Stripe MPP** | Live account — crypto deposits via Tempo/Stellar |
| **License** | MIT |

---

## Technology

| Layer | Technology |
|-------|-----------|
| **EVM** | [viem](https://viem.sh) — type-safe Ethereum client |
| **Stellar** | [@stellar/stellar-sdk](https://stellar.org) — official Foundation SDK |
| **Solana** | [@solana/web3.js](https://solana.com) + [@solana/spl-token](https://spl.solana.com/token) |
| **Stripe** | Stripe API `2026-03-04.preview` — MPP/SPT native |
| **HTTP** | [axios](https://axios-http.com) — interceptor-based 402 handling |
| **Build** | TypeScript strict, dual CJS/ESM output |
| **Test** | [Vitest](https://vitest.dev) — 148 tests |

---

## Partners & Integrations

<table>
<tr>
<td align="center" width="14%">
<a href="https://base.org">
<img src="https://img.shields.io/badge/Base-0052FF?style=for-the-badge&logo=coinbase&logoColor=white" alt="Base" />
</a>
<br><sub>x402 native chain<br/>Primary EVM</sub>
</td>
<td align="center" width="14%">
<a href="https://circle.com">
<img src="https://img.shields.io/badge/Circle-00D632?style=for-the-badge&logoColor=white" alt="Circle" />
</a>
<br><sub>USDC issuer<br/>9 chains</sub>
</td>
<td align="center" width="14%">
<a href="https://stellar.org">
<img src="https://img.shields.io/badge/Stellar-7C3AED?style=for-the-badge" alt="Stellar" />
</a>
<br><sub>Stellar USDC<br/>Tempo network</sub>
</td>
<td align="center" width="14%">
<a href="https://solana.com">
<img src="https://img.shields.io/badge/Solana-14F195?style=for-the-badge&logo=solana&logoColor=black" alt="Solana" />
</a>
<br><sub>SOL + USDC SPL<br/>Mainnet + Devnet</sub>
</td>
<td align="center" width="14%">
<a href="https://stripe.com">
<img src="https://img.shields.io/badge/Stripe-635BFF?style=for-the-badge&logo=stripe&logoColor=white" alt="Stripe" />
</a>
<br><sub>MPP Partner<br/>Live account</sub>
</td>
<td align="center" width="14%">
<a href="https://arbitrum.io">
<img src="https://img.shields.io/badge/Arbitrum-28A0F0?style=for-the-badge" alt="Arbitrum" />
</a>
<br><sub>L2 settlement<br/>USDC native</sub>
</td>
</tr>
</table>

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

### Built by [ASG Compute](https://asgcompute.com)

[pay.asgcard.dev](https://pay.asgcard.dev) • [fund.asgcard.dev](https://fund.asgcard.dev) • [asgcard.dev](https://asgcard.dev)

*Autonomous payments for autonomous agents.*

**[📦 npm](https://www.npmjs.com/package/@asgcard/pay) • [🐦 Twitter](https://x.com/asgcard) • [▶ Live Demo](https://asgcompute.github.io/ASGCompute-ows-agent-pay/)**

</div>
