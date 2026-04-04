<p align="center">
  <img src="docs/assets/hero-banner.png" alt="ASG Pay — Payment Infrastructure for AI Agents" width="100%" />
</p>

<p align="center">
  <strong>Give your AI agent a wallet with rules.</strong><br>
  <sub>15 networks • x402 + Stripe MPP • Fail-closed policy engine • Production-ready</sub>
</p>

<p align="center">
  <a href="https://github.com/ASGCompute/ASGCompute-ows-agent-pay/actions/workflows/ci.yml"><img src="https://github.com/ASGCompute/ASGCompute-ows-agent-pay/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@asgcard/pay"><img src="https://img.shields.io/npm/v/@asgcard/pay?style=flat-square&color=635bff&label=npm" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/tests-148%20passed-22c55e?style=flat-square" alt="tests" />
  <img src="https://img.shields.io/badge/networks-15-635bff?style=flat-square" alt="networks" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
</p>

<p align="center">
  <a href="https://pay.asgcard.dev"><strong>Documentation</strong></a> · 
  <a href="#quick-start"><strong>Quick Start</strong></a> · 
  <a href="#supported-networks-15"><strong>Networks</strong></a> · 
  <a href="#-ecosystem"><strong>Ecosystem</strong></a> · 
  <a href="https://asgcompute.github.io/ASGCompute-ows-agent-pay/"><strong>Live Demo</strong></a>
</p>

---

## The Problem

AI agents are autonomous workers — but they can't pay for anything. When an agent hits `HTTP 402 Payment Required`, it stops dead. No card, no wallet, no way to pay.

**ASG Pay** gives every AI agent a wallet with strict spending rules. The agent just calls `performTask()` — the SDK handles everything:

```
Agent → API request → 402 "Pay $0.50" → SDK auto-settles on-chain → Agent gets response
```

Zero payment code in your agent. One line to install:

```bash
npm install @asgcard/pay
```

---

## Quick Start

```typescript
import { OwsClient, EvmPaymentAdapter } from '@asgcard/pay';

const agent = new OwsClient({
  baseURL: 'https://api.example.com',
  adapter: new EvmPaymentAdapter({
    chain: 'base',           // or: 'arbitrum', 'optimism', 'ethereum', 'polygon'
    asset: 'USDC',           // or: 'native' for ETH/MATIC
    privateKey: process.env.AGENT_KEY as `0x${string}`,
  }),
  policy: {
    maxAmountPerTransaction: 5,   // $5 cap per payment
    monthlyBudget: 100,           // $100/month total
  },
});

// Your agent code — zero payment logic needed
const data = await agent.performTask('/v1/inference', {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Summarize this research paper' }],
});
```

<details>
<summary><strong>🌐 Stellar Example</strong></summary>

```typescript
import { OwsClient, StellarPaymentAdapter } from '@asgcard/pay';

const agent = new OwsClient({
  baseURL: 'https://api.example.com',
  adapter: new StellarPaymentAdapter({
    secretKey: process.env.STELLAR_SECRET!,
    network: 'mainnet',
    asset: 'USDC',   // Circle USDC on Stellar
  }),
  policy: { monthlyBudget: 50, maxAmountPerTransaction: 2 },
});
```

</details>

<details>
<summary><strong>◎ Solana Example</strong></summary>

```typescript
import { OwsClient, SolanaPaymentAdapter } from '@asgcard/pay';

const agent = new OwsClient({
  baseURL: 'https://api.example.com',
  adapter: new SolanaPaymentAdapter({
    secretKey: myKeypair.secretKey,
    network: 'mainnet-beta',
    asset: 'USDC',   // Circle USDC SPL token
  }),
  policy: { monthlyBudget: 50, maxAmountPerTransaction: 2 },
});
```

</details>

<details>
<summary><strong>💳 Stripe MPP Example</strong></summary>

```typescript
import { OwsClient, StripePaymentAdapter } from '@asgcard/pay';

const agent = new OwsClient({
  baseURL: 'https://api.example.com',
  adapter: new StripePaymentAdapter({
    stripeSecretKey: process.env.STRIPE_SECRET_KEY!,
    networkId: 'my-network',
  }),
  policy: { monthlyBudget: 200, maxAmountPerTransaction: 10 },
});
```

</details>

---

## Architecture

```
                          ┌─────────────────────┐
                          │     AI Agent         │
                          │   performTask()      │
                          └──────────┬──────────┘
                                     │
                          ┌──────────▼──────────┐
                          │     OwsClient        │
                          │  (402 Interceptor)   │
                          └─┬────────────────┬───┘
                            │                │
               ┌────────────▼──┐    ┌────────▼────────┐
               │ Protocol      │    │  PolicyEngine    │
               │ Router        │    │                  │
               │               │    │  ├─ Per-tx cap   │
               │ x402 → proof  │    │  ├─ Budget       │
               │ MPP  → cred   │    │  ├─ Whitelist    │
               └───────────────┘    │  └─ Fail-closed  │
                                    └────────┬─────────┘
                                             │
                     ┌───────────────────────▼───────────────────────┐
                     │            PaymentAdapter (interface)          │
                     ├────────────┬────────────┬──────────┬─────────┤
                     │    EVM     │  Stellar   │  Solana  │  Stripe │
                     │  10 chains │  XLM/USDC  │ SOL/USDC │   MPP   │
                     └────────────┴────────────┴──────────┴─────────┘
```

<table>
<tr>
<th>Component</th>
<th>File</th>
<th>What it does</th>
</tr>
<tr>
<td><strong>OwsClient</strong></td>
<td><a href="src/client.ts">client.ts</a></td>
<td>Dual-protocol HTTP client. Intercepts 402, auto-detects x402 vs MPP, settles, retries.</td>
</tr>
<tr>
<td><strong>PolicyEngine</strong></td>
<td><a href="src/policy.ts">policy.ts</a></td>
<td>Fail-closed 4-gate budget controller. Rejects everything by default.</td>
</tr>
<tr>
<td><strong>MPP Protocol</strong></td>
<td><a href="src/mpp.ts">mpp.ts</a></td>
<td>RFC 7235 WWW-Authenticate parser, credential builder, protocol detector.</td>
</tr>
<tr>
<td><strong>EvmPaymentAdapter</strong></td>
<td><a href="src/adapters/evm.ts">adapters/evm.ts</a></td>
<td>10 EVM chains. ETH/MATIC + Circle USDC. One class, all chains.</td>
</tr>
<tr>
<td><strong>StellarPaymentAdapter</strong></td>
<td><a href="src/adapters/stellar.ts">adapters/stellar.ts</a></td>
<td>Stellar XLM + USDC with auto trustline management. Mainnet + Testnet.</td>
</tr>
<tr>
<td><strong>SolanaPaymentAdapter</strong></td>
<td><a href="src/adapters/solana.ts">adapters/solana.ts</a></td>
<td>SOL + USDC SPL with auto ATA creation. Mainnet-beta + Devnet.</td>
</tr>
<tr>
<td><strong>StripePaymentAdapter</strong></td>
<td><a href="src/adapters/stripe.ts">adapters/stripe.ts</a></td>
<td>Stripe MPP. SPT lifecycle, crypto deposits via Tempo, server challenge builder.</td>
</tr>
</table>

> **Pluggable**: Add any chain by implementing the [`PaymentAdapter`](src/adapters/types.ts) interface (~40 lines).

---

## Supported Networks (15)

<table>
<tr>
<td>

### EVM (10 chains)

| Chain | Mainnet | Testnet | USDC |
|-------|:-------:|:-------:|:----:|
| **Base** | `eip155:8453` | `eip155:84532` | ✅ Circle |
| **Arbitrum** | `eip155:42161` | `eip155:421614` | ✅ Circle |
| **Optimism** | `eip155:10` | `eip155:11155420` | ✅ Circle |
| **Ethereum** | `eip155:1` | `eip155:11155111` | ✅ Circle |
| **Polygon** | `eip155:137` | `eip155:80002` | ✅ Circle |

</td>
<td>

### Non-EVM (5)

| Network | CAIP-2 | Assets |
|---------|--------|--------|
| **Stellar Mainnet** | `stellar:pubnet` | XLM, USDC |
| **Stellar Testnet** | `stellar:testnet` | XLM, USDC |
| **Solana Mainnet** | `solana:5eykt4…` | SOL, USDC |
| **Solana Devnet** | `solana:4uhcVJ…` | SOL, USDC |
| **Stripe MPP** | `stripe:live` | USD (fiat) |

</td>
</tr>
</table>

> All USDC contracts are [Circle's official native deployments](https://developers.circle.com/stablecoins/docs/usdc-on-main-networks). All RPCs verified live.

---

## Dual Protocol Support

ASG Pay is the **only SDK** that natively supports both major machine payment protocols:

<table>
<tr>
<td width="50%">

### x402 Protocol
<sub>Coinbase · Cloudflare · Base</sub>

```
Server → 402 + JSON body
         { x402Version: 1, accepts: [...] }

Agent  → On-chain tx
       → X-PAYMENT: <base64 proof>

Server → 200 OK ✅
```

</td>
<td width="50%">

### Machine Payments Protocol (MPP)
<sub>Stripe · Tempo · Stellar</sub>

```
Server → 402
       → WWW-Authenticate: Payment
         id="ch1", method="stripe"

Agent  → Create SPT
       → Authorization: Payment <cred>

Server → 200 OK + Payment-Receipt ✅
```

</td>
</tr>
</table>

---

## Policy Engine

Every payment passes through **4 fail-closed gates**. If any gate fails → payment is silently rejected. No override. No bypass.

```
 ┌─ Gate 1: amount > 0 ───────────┐
 │  Rejects zero/negative amounts  │
 └─────────────────────────────────┘
              │ pass
 ┌─ Gate 2: per-tx limit ─────────┐
 │  $10 request, $5 limit → ❌     │
 └─────────────────────────────────┘
              │ pass
 ┌─ Gate 3: monthly budget ────────┐
 │  $3 + $98 spent > $100 → ❌     │
 └─────────────────────────────────┘
              │ pass
 ┌─ Gate 4: destination whitelist ─┐
 │  Unknown address → ❌            │
 └─────────────────────────────────┘
              │ pass
           ✅ SETTLED
```

---

## 🌐 Ecosystem

ASG Pay is the core engine powering a suite of live production products:

<table>
<tr>
<td align="center" width="25%">
  <br>
  <a href="https://pay.asgcard.dev"><strong>⚡ ASG Pay</strong></a>
  <br><br>
  <sub>Payment SDK & infrastructure.<br>15 networks, 2 protocols.<br><code>npm i @asgcard/pay</code></sub>
  <br><br>
  <a href="https://pay.asgcard.dev">pay.asgcard.dev →</a>
</td>
<td align="center" width="25%">
  <br>
  <a href="https://asgcard.dev"><strong>💳 ASG Card</strong></a>
  <br><br>
  <sub>Virtual MasterCards for AI agents.<br>Issue & fund via USDC on Stellar.<br><code>npx @asgcard/cli</code></sub>
  <br><br>
  <a href="https://asgcard.dev">asgcard.dev →</a>
</td>
<td align="center" width="25%">
  <br>
  <a href="https://fund.asgcard.dev"><strong>💰 ASG Fund</strong></a>
  <br><br>
  <sub>One-link agent funding.<br>Credit card, bank, or crypto.<br><code>npm i @asgcard/fund</code></sub>
  <br><br>
  <a href="https://fund.asgcard.dev">fund.asgcard.dev →</a>
</td>
<td align="center" width="25%">
  <br>
  <a href="https://www.npmjs.com/package/@asgcard/mcp-server"><strong>🤖 MCP Server</strong></a>
  <br><br>
  <sub>11 tools for Claude, Codex, Cursor.<br>Natural language card management.<br><code>npm i @asgcard/mcp-server</code></sub>
  <br><br>
  <a href="https://www.npmjs.com/package/@asgcard/mcp-server">npm →</a>
</td>
</tr>
</table>

### 📦 All Packages

| Package | Description | Install |
|---------|-------------|---------|
| **[@asgcard/pay](https://www.npmjs.com/package/@asgcard/pay)** | Multi-chain payment SDK (this repo) | `npm i @asgcard/pay` |
| **[@asgcard/cli](https://www.npmjs.com/package/@asgcard/cli)** | Virtual card CLI — create, fund, freeze | `npx @asgcard/cli` |
| **[@asgcard/sdk](https://www.npmjs.com/package/@asgcard/sdk)** | Card management TypeScript SDK | `npm i @asgcard/sdk` |
| **[@asgcard/mcp-server](https://www.npmjs.com/package/@asgcard/mcp-server)** | MCP server — 11 AI agent tools | `npm i @asgcard/mcp-server` |
| **[@asgcard/fund](https://www.npmjs.com/package/@asgcard/fund)** | Payment link generator | `npm i @asgcard/fund` |

---

## Testing

```bash
# All 143 unit tests (no secrets needed)
npm test

# Full 148 including live Stripe integration
STRIPE_SECRET_KEY=sk_live_… npm test
```

| Suite | Tests | Coverage |
|-------|-------|----------|
| `evm.test.ts` | 44 | 10 chains, native + USDC, balances |
| `mpp.test.ts` | 26 | Challenge parsing, credentials, detection |
| `stripe.test.ts` | 25 | SPT flow, PI creation, server challenges |
| `policy.test.ts` | 20 | All 4 gates, budget tracking, reset |
| `solana.test.ts` | 18 | SOL/USDC, ATA, airdrop protection |
| `client.test.ts` | 10 | Dual-protocol 402, retry logic |
| `stripe.integration.test.ts` | 5 | **Live Stripe API** — real PaymentIntents |
| **Total** | **148** | ✅ |

---

## Partners & Integrations

<p align="center">
  <a href="https://base.org"><img src="https://img.shields.io/badge/Base-0052FF?style=for-the-badge&logo=coinbase&logoColor=white" alt="Base" /></a>&nbsp;
  <a href="https://circle.com"><img src="https://img.shields.io/badge/Circle_USDC-00D632?style=for-the-badge&logoColor=white" alt="Circle" /></a>&nbsp;
  <a href="https://stellar.org"><img src="https://img.shields.io/badge/Stellar-7C3AED?style=for-the-badge" alt="Stellar" /></a>&nbsp;
  <a href="https://solana.com"><img src="https://img.shields.io/badge/Solana-14F195?style=for-the-badge&logo=solana&logoColor=black" alt="Solana" /></a>&nbsp;
  <a href="https://stripe.com"><img src="https://img.shields.io/badge/Stripe_MPP-635BFF?style=for-the-badge&logo=stripe&logoColor=white" alt="Stripe" /></a>&nbsp;
  <a href="https://arbitrum.io"><img src="https://img.shields.io/badge/Arbitrum-28A0F0?style=for-the-badge" alt="Arbitrum" /></a>&nbsp;
  <a href="https://optimism.io"><img src="https://img.shields.io/badge/Optimism-FF0420?style=for-the-badge" alt="Optimism" /></a>&nbsp;
  <a href="https://ethereum.org"><img src="https://img.shields.io/badge/Ethereum-3C3C3D?style=for-the-badge&logo=ethereum&logoColor=white" alt="Ethereum" /></a>&nbsp;
  <a href="https://polygon.technology"><img src="https://img.shields.io/badge/Polygon-8247E5?style=for-the-badge" alt="Polygon" /></a>
</p>

---

## Technology

| Layer | Stack |
|-------|-------|
| **EVM** | [viem](https://viem.sh) — type-safe client from the Wagmi team |
| **Stellar** | [@stellar/stellar-sdk](https://stellar.org) — official Stellar Foundation |
| **Solana** | [@solana/web3.js](https://solana.com) + [@solana/spl-token](https://spl.solana.com/token) |
| **Stripe** | Stripe API `2026-03-04.preview` with native MPP/SPT |
| **HTTP** | [axios](https://axios-http.com) with interceptor-based 402 handling |
| **Build** | TypeScript strict mode, dual CJS + ESM output |
| **Test** | [Vitest](https://vitest.dev) — 148 tests, CI-ready |

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built by <a href="https://asgcompute.com">ASG Compute</a></strong>
  <br><br>
  <a href="https://pay.asgcard.dev">pay.asgcard.dev</a> · 
  <a href="https://fund.asgcard.dev">fund.asgcard.dev</a> · 
  <a href="https://asgcard.dev">asgcard.dev</a>
  <br><br>
  <sub>Autonomous payments for autonomous agents.</sub>
  <br><br>
  <a href="https://www.npmjs.com/package/@asgcard/pay">📦 npm</a> · 
  <a href="https://x.com/asgcard">𝕏 Twitter</a> · 
  <a href="https://asgcompute.github.io/ASGCompute-ows-agent-pay/">▶ Live Demo</a>
</p>
