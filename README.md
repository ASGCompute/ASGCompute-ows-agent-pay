<h1 align="center">
  🤖 OWS Agent Pay
</h1>

<p align="center">
  <strong>Autonomous payment SDK for AI agents — OWS-compliant, Stellar-settled, policy-gated.</strong>
</p>

<p align="center">
  <a href="https://openwallet.sh"><img src="https://img.shields.io/badge/OWS-Hackathon%202026-black?style=for-the-badge" alt="OWS Hackathon"></a>
  <a href="https://pay.asgcard.dev"><img src="https://img.shields.io/badge/ASG%20Pay-Production-6C63FF?style=for-the-badge" alt="ASG Pay"></a>
  <a href="https://stellar.org"><img src="https://img.shields.io/badge/Built%20on-Stellar-000?style=for-the-badge&logo=stellar" alt="Stellar"></a>
  <a href="https://www.npmjs.com/org/asgcard"><img src="https://img.shields.io/badge/NPM-100k%2B%2Fmo-CB3837?style=for-the-badge&logo=npm" alt="NPM Downloads"></a>
</p>

---

## The Problem

AI agents need to **pay for resources autonomously** — API calls, GPU inference, data feeds — but today every payment requires a human in the loop. That doesn't scale.

## Our Solution

**OWS Agent Pay** is a TypeScript SDK that gives any AI agent the ability to handle [HTTP 402 Payment Required](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/402) challenges **without human intervention**:

1. **Intercept** — Axios interceptor catches `402` responses automatically  
2. **Evaluate** — On-device Policy Engine checks budget caps, per-tx limits, and destination whitelists  
3. **Settle** — Executes an on-chain Stellar payment in < 5 seconds  
4. **Retry** — Constructs a signed `X-PAYMENT` proof token and replays the original HTTP request  

The agent never writes a single line of payment code. It just calls an API.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        AI Agent                              │
│  agent.performTask("/api/inference", { prompt: "..." })      │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                    OWS Client (Axios)                         │
│                                                              │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │ 402      │──▶│ Policy       │──▶│ Stellar Payment      │ │
│  │ Intercept│   │ Engine       │   │ Adapter              │ │
│  │          │   │              │   │                      │ │
│  │ Parse    │   │ • Per-tx cap │   │ • Build & sign tx    │ │
│  │ OWS      │   │ • Monthly $ │   │ • Submit to Horizon  │ │
│  │ challenge│   │ • Whitelist  │   │ • Return tx hash     │ │
│  └──────────┘   └──────────────┘   └──────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Construct X-PAYMENT proof  →  Retry original request     ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                 Paid API (returns 200 + data)                 │
└──────────────────────────────────────────────────────────────┘
```

---

## Quick Start

```bash
# Clone
git clone https://github.com/ASGCompute/ASGCompute-ows-agent-pay.git
cd ASGCompute-ows-agent-pay

# Install
npm install

# Run the live demo (Stellar Testnet — no real money)
npm run demo
```

### What the demo does

| Step | What happens |
|------|-------------|
| 1 | A mock API server starts on `:4020` with a **$0.50 paywall** |
| 2 | An AI agent sends a request to `/api/inference` |
| 3 | The server responds with **HTTP 402** + OWS challenge |
| 4 | The OWS Client **intercepts**, runs the **Policy Engine** |
| 5 | **Settles 0.5 XLM** on Stellar Testnet via Friendbot-funded wallet |
| 6 | Constructs `X-PAYMENT` token and **retries the request** |
| 7 | Agent receives the paid content ✅ |

---

## Usage in Your Agent

```typescript
import { OwsClient, StellarPaymentAdapter } from '@asgcard/ows-agent-pay';

const client = new OwsClient({
  baseURL: 'https://api.example.com',
  policy: {
    monthlyBudget: 50.0,          // $50/month cap
    maxAmountPerTransaction: 2.0,  // $2 max per call
    allowedDestinations: ['G...'], // optional whitelist
  },
  stellarAdapter: new StellarPaymentAdapter({
    secretKey: process.env.AGENT_STELLAR_SECRET!,
  }),
});

// The agent just calls APIs — payments happen transparently
const result = await client.performTask('/v1/chat/completions', {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

---

## Production Infrastructure — ASG Pay

This SDK is **extracted from the production ASG Pay stack** — a full autonomous payment infrastructure for AI agents that is already live:

| Component | URL | Description |
|-----------|-----|-------------|
| **ASG Pay Landing** | [pay.asgcard.dev](https://pay.asgcard.dev) | Marketing & product overview |
| **ASG Fund** | [fund.asgcard.dev](https://fund.asgcard.dev) | Fiat-to-crypto on-ramp for agent wallets |
| **NPM Packages** | [@asgcard](https://www.npmjs.com/org/asgcard) | **100,000+ monthly downloads** |
| **x402 Middleware** | Production | HTTP 402 enforcement for Express/Node APIs |
| **Stripe MPP** | Production | Fiat settlement via Stripe Managed Payouts |
| **Stellar Settlement** | Production | On-chain USDC settlement on Stellar mainnet |

### Why this matters for OWS

We're not building from scratch. **ASG Pay is already processing payments.** This hackathon submission extracts the core autonomous payment logic into a clean, OWS-compliant SDK that any developer can drop into their AI agent in < 10 lines of code.

---

## Tracks

- ✅ **Agent Spend Governance & Identity** — PolicyEngine enforces per-tx caps, monthly budgets, destination whitelists
- ✅ **Pay-Per-Call Services & API Monetization** — Transparent 402 interception enables pay-per-call on any HTTP API

---

## Project Structure

```
src/
  ├── index.ts       # Barrel exports
  ├── client.ts      # OwsClient — Axios + 402 interceptor
  ├── policy.ts      # PolicyEngine — budget & whitelist checks
  └── stellar.ts     # StellarPaymentAdapter — on-chain settlement
demo.ts              # End-to-end runnable demo
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript |
| HTTP Client | Axios (interceptor pattern) |
| Blockchain | Stellar (via `@stellar/stellar-sdk`) |
| Settlement | Native XLM (Testnet) / USDC (Production) |
| Protocol | [x402](https://x402.org) + [OWS](https://openwallet.sh) |

---

## Team

**ASG Compute** — Autonomous Payment Infrastructure for AI Agents

- 🌐 [asgcard.dev](https://asgcard.dev)
- 📦 [npmjs.com/org/asgcard](https://www.npmjs.com/org/asgcard) — 100k+ monthly downloads
- 🛰️ Built on [Stellar](https://stellar.org)

---

## License

MIT — see [LICENSE](./LICENSE)
