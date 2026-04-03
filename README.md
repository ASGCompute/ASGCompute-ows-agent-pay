<div align="center">

# 🤖 OWS Agent Pay

### Autonomous Payment SDK for AI Agents

**OWS-compliant • Policy-gated • Multi-chain settlement • Zero human interaction**

[![OWS Hackathon 2026](https://img.shields.io/badge/OWS-Hackathon%202026-000000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+PHBhdGggZD0iTTEyIDJMNCA3djEwbDggNSA4LTVWN2wtOC01eiIvPjwvc3ZnPg==)](https://hackathon.openwallet.sh)
[![x402 Protocol](https://img.shields.io/badge/x402-Protocol-FF6B35?style=for-the-badge)](https://x402.org)
[![NPM Downloads](https://img.shields.io/badge/NPM-100k%2B%2Fmo-CB3837?style=for-the-badge&logo=npm)](https://www.npmjs.com/org/asgcard)
[![MIT License](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](./LICENSE)

<br/>

**Built by [ASG Pay](https://pay.asgcard.dev)** — Production autonomous payment infrastructure for AI agents

[Live Demo](#-quick-start) · [Architecture](#-architecture) · [ASG Pay Ecosystem](#-production-infrastructure--asg-pay-ecosystem) · [Tracks](#-hackathon-tracks)

</div>

---

## 🎯 The Problem

AI agents are becoming first-class participants in blockchain ecosystems — executing trades, paying for inference, managing treasuries. But every payment still requires a **human in the loop**. Agents encounter paywalls and stop. That doesn't scale.

> *"Every tool reinvents the wallet. When every tool owns its own keys, nobody owns security."*
> — [Open Wallet Standard Specification](https://openwallet.sh)

## 💡 Our Solution

**OWS Agent Pay** implements the [Open Wallet Standard](https://openwallet.sh) to give AI agents **autonomous payment capability** via the [x402/MPP protocol](https://x402.org). When an agent hits a paid API, the SDK transparently:

| Step | Action | OWS Spec Alignment |
|------|--------|-------------------|
| **① Intercept** | Axios catches `HTTP 402 Payment Required` | x402 protocol compliance |
| **② Evaluate** | On-device Policy Engine checks budget caps, per-tx limits, destination whitelists | [OWS §03 — Policy Engine](https://docs.openwallet.sh/doc.html?slug=03-policy-engine) |
| **③ Settle** | Executes on-chain payment (Stellar, extensible to all CAIP chains) | [OWS §07 — Supported Chains](https://docs.openwallet.sh/doc.html?slug=07-supported-chains) |
| **④ Prove** | Constructs signed `X-PAYMENT` token | x402 payment proof format |
| **⑤ Retry** | Replays original request with proof — agent gets paid content | Transparent to the agent |

**The agent never writes a single line of payment code.**

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AI Agent                                   │
│                                                                     │
│   agent.performTask("/api/inference", { prompt: "..." })            │
│   // Agent has NO knowledge of payment — just calls an API          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     OWS Agent Pay Client                            │
│                                                                     │
│  ┌─────────────┐   ┌────────────────────┐   ┌───────────────────┐  │
│  │   402        │   │   Policy Engine    │   │   Payment         │  │
│  │   Intercept  │──▶│   (OWS §03)       │──▶│   Adapter         │  │
│  │              │   │                    │   │                   │  │
│  │  • Parse OWS │   │  • Per-tx cap     │   │  • Build tx       │  │
│  │    challenge │   │  • Monthly budget  │   │  • Sign & submit  │  │
│  │  • Extract   │   │  • Destination     │   │  • Return hash    │  │
│  │    pricing   │   │    whitelist       │   │                   │  │
│  │  • Validate  │   │  • Fail-closed     │   │  Stellar (live)   │  │
│  │    x402      │   │    default         │   │  EVM (roadmap)    │  │
│  │    version   │   │                    │   │  Solana (roadmap) │  │
│  └─────────────┘   └────────────────────┘   └───────────────────┘  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Build X-PAYMENT proof (base64)  →  Retry original HTTP request ││
│  └─────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Paid API Endpoint — returns 200 + premium data         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/ASGCompute/ASGCompute-ows-agent-pay.git
cd ASGCompute-ows-agent-pay

# Install dependencies
npm install

# Run the live demo (Stellar Testnet — no real money)
npm run demo
```

### What the demo does

```
╔══════════════════════════════════════════════╗
║   OWS Agent Pay — Autonomous Payment Demo   ║
║   Built by ASG Pay  •  https://asgcard.dev   ║
╚══════════════════════════════════════════════╝
```

| Step | Event | Output |
|------|-------|--------|
| 1 | Mock API server starts on `:4020` | `[Server] Mock API listening` |
| 2 | AI agent sends inference request | `[Agent] 🧠 Sending task` |
| 3 | Server responds **HTTP 402** + OWS challenge | `[OWS Client] ⚡ Received 402` |
| 4 | Policy Engine evaluates ($0.50 < $1.00 cap) | `[OWS Client] ✅ Policy check PASSED` |
| 5 | Stellar adapter settles 0.5 XLM on testnet | `[Stellar] ✅ Confirmed — hash: abc…` |
| 6 | X-PAYMENT token constructed and sent | `[OWS Client] 🔁 Retrying…` |
| 7 | **Agent receives paid content** 🎉 | `[Agent] ✅ Task completed` |

---

## 📦 Integration

```typescript
import { OwsClient, StellarPaymentAdapter } from '@asgcard/ows-agent-pay';

const client = new OwsClient({
  baseURL: 'https://api.example.com',
  policy: {
    monthlyBudget: 50.0,           // $50/month rolling cap
    maxAmountPerTransaction: 2.0,   // $2 max per single call
    allowedDestinations: ['G...'],  // optional Stellar address whitelist
  },
  stellarAdapter: new StellarPaymentAdapter({
    secretKey: process.env.AGENT_STELLAR_SECRET!,
  }),
});

// The agent calls APIs normally — payments happen transparently
const result = await client.performTask('/v1/chat/completions', {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Analyze this market data' }],
});
```

---

## 🔐 OWS Specification Compliance

Our implementation aligns with the [Open Wallet Standard v1.0.0](https://docs.openwallet.sh/):

| OWS Section | Our Implementation |
|------------|-------------------|
| **§03 — Policy Engine** | `PolicyEngine` class with per-tx caps, monthly budget, destination whitelist. Fail-closed by default — if policy check errors, payment is denied. |
| **§04 — Agent Access** | Agent never sees private keys. `StellarPaymentAdapter` encapsulates all key material. Agent only calls `performTask()`. |
| **§05 — Key Isolation** | Secret key is held exclusively inside the adapter. No key material is exposed to the HTTP layer or returned to the caller. |
| **x402 Protocol** | Full support for x402 Version 2 challenge/response. Parses `accepts[]` array, validates scheme/network/amount, constructs base64 `X-PAYMENT` proof. |
| **CAIP Identifiers** | Architecture is designed for [CAIP-2](https://chainagnostic.org/) chain IDs. Stellar adapter is the first implementation; EVM and Solana adapters are on the roadmap. |

---

## 🌐 Production Infrastructure — ASG Pay Ecosystem

**This is not a hackathon-only project.** OWS Agent Pay is extracted from the **production ASG Pay stack** — an autonomous payment infrastructure that is already live and serving developers.

<div align="center">

### 🏢 ASG Pay — The Full Stack

</div>

| Product | URL | What it does |
|---------|-----|-------------|
| 🌐 **ASG Pay** | [pay.asgcard.dev](https://pay.asgcard.dev) | Marketing & product overview — learn about the platform |
| 💳 **ASG Fund** | [fund.asgcard.dev](https://fund.asgcard.dev) | Fiat-to-crypto on-ramp — fund agent wallets with credit card |
| 📦 **NPM Packages** | [@asgcard](https://www.npmjs.com/org/asgcard) | Developer tools — **100,000+ monthly downloads** |
| 🔧 **x402 Middleware** | Production | HTTP 402 paywall enforcement for Express/Node.js APIs |
| 💰 **Stripe MPP** | Production | Fiat settlement via Stripe Managed Payouts |
| ⭐ **Stellar Settlement** | Production | On-chain USDC settlement on Stellar mainnet |

<div align="center">

### Why this matters

> *We didn't build this for a hackathon. We extracted it from production.*
>
> ASG Pay processes real payments. **100,000+ monthly NPM downloads** prove market traction. This submission packages our battle-tested x402 payment flow into a clean, OWS-compliant SDK that any developer can drop into their AI agent.

</div>

---

## 🏆 Hackathon Tracks

### Track 02 — Agent Spend Governance & Identity ✅

Our `PolicyEngine` implements on-device governance that prevents agents from overspending:

- **Per-transaction limits** — cap individual API call costs
- **Monthly rolling budget** — total spend ceiling across all calls
- **Destination whitelist** — restrict which addresses the agent can pay
- **Fail-closed** — any policy error defaults to denial (OWS §03 compliance)

### Track 03 — Pay-Per-Call Services & API Monetization ✅

The `OwsClient` enables seamless pay-per-call monetization:

- **Transparent 402 interception** — developers add our middleware; agents auto-pay
- **x402 protocol** — standard envelope for pricing, settlement, and proof
- **Sub-5s settlement** — Stellar transactions confirm in ~4 seconds
- **Zero integration burden** — agents don't need payment code

---

## 📁 Project Structure

```
ASGCompute-ows-agent-pay/
├── src/
│   ├── index.ts        # Barrel exports
│   ├── client.ts       # OwsClient — Axios + 402 interceptor
│   ├── policy.ts       # PolicyEngine — budget & whitelist governance
│   └── stellar.ts      # StellarPaymentAdapter — on-chain settlement
├── demo.ts             # End-to-end runnable demo
├── package.json        # Package configuration & scripts
├── tsconfig.json       # TypeScript configuration
└── README.md           # You are here
```

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Language | TypeScript | Type-safe agent SDK |
| HTTP Client | Axios | Interceptor pattern for 402 handling |
| Blockchain | Stellar (via `@stellar/stellar-sdk`) | On-chain settlement |
| Protocol | [x402](https://x402.org) + [OWS](https://openwallet.sh) | Payment standard |
| Identity | [CAIP-2](https://chainagnostic.org/) | Chain-agnostic identifiers |
| Governance | On-device Policy Engine | Budget caps & whitelists |

---

## 🗺 Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| Stellar Settlement | ✅ Done | Native XLM + USDC on Stellar |
| Policy Engine | ✅ Done | Per-tx, monthly, whitelist |
| x402 Interceptor | ✅ Done | Full V2 challenge/response |
| EVM Adapter | 🔜 Next | Base, Arbitrum via ethers.js |
| Solana Adapter | 🔜 Next | SOL + USDC via @solana/web3.js |
| OWS Core Integration | 🔜 Next | `@open-wallet-standard/core` wallet vault |
| MCP Tool Exposure | 📋 Planned | `ows_sign` / `ows_pay` MCP tools |

---

## 👥 Team — ASG Compute

<div align="center">

**Autonomous Payment Infrastructure for AI Agents**

[🌐 asgcard.dev](https://asgcard.dev) · [💳 fund.asgcard.dev](https://fund.asgcard.dev) · [📦 NPM](https://www.npmjs.com/org/asgcard)

Built on [Stellar](https://stellar.org) · Powered by [x402](https://x402.org) · Aligned with [OWS](https://openwallet.sh)

</div>

---

## 🤝 Hackathon Partners

<div align="center">

This project is submitted to the [OWS Hackathon 2026](https://hackathon.openwallet.sh) — proudly supported by:

**Strategic Partners**

[MoonPay](https://moonpay.com) · [Circle](https://circle.com) · [Solana Foundation](https://solana.org) · [Arbitrum](https://arbitrum.io) · [Base](https://base.org) · [Sui](https://sui.io) · [Tron](https://tron.network) · [XRPL](https://xrpl.org)

**Infrastructure Partners**

[XMTP](https://xmtp.org) · [Zerion](https://zerion.io) · [Allium](https://allium.so) · [Dfns](https://dfns.co) · [DFlow](https://dflow.net)

</div>

---

## 📄 License

MIT — see [LICENSE](./LICENSE)
