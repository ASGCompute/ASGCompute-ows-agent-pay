<div align="center">

# 🚀 OWS Agent Pay

### Autonomous Payment SDK for AI Agents

**OWS-compliant** • **x402 Protocol** • **Multi-chain** • **Policy-gated**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OWS v1.0.0](https://img.shields.io/badge/OWS-v1.0.0-00D4FF)](https://openwallet.sh)
[![x402](https://img.shields.io/badge/x402-Protocol-FF6B35)](https://x402.org)
[![npm](https://img.shields.io/npm/dm/@asgcard/pay?label=npm%20downloads&color=22c55e)](https://www.npmjs.com/package/@asgcard/pay)
[![Base](https://img.shields.io/badge/Base-0052FF?logo=coinbase&logoColor=white)](https://base.org)
[![Stellar](https://img.shields.io/badge/Stellar-7C3AED)](https://stellar.org)
[![Built by ASG Pay](https://img.shields.io/badge/Built_by-ASG_Pay-00FF88)](https://pay.asgcard.dev)

*The AI agent simply calls `performTask()` — the SDK handles payment, policy validation, on-chain settlement, and proof generation transparently.*

[Documentation](https://pay.asgcard.dev) • [**▶ Live Demo**](https://asgcompute.github.io/ASGCompute-ows-agent-pay/) • [Architecture](#%EF%B8%8F-architecture) • [Live Products](#-live-production-products) • [OWS Compliance](#-ows-spec-compliance)

> **🎮 [Try the interactive demo →](https://asgcompute.github.io/ASGCompute-ows-agent-pay/)** — no install, no wallet, no ETH needed. Watch the full x402 flow in your browser.

> **🌐 [View the full ecosystem demo →](https://asgcompute.github.io/ASGCompute-ows-agent-pay/ecosystem.html)** — Fund → Card → Pay: the complete autonomous agent financial stack.

</div>

---

## 💡 What This Solves

AI agents are rapidly becoming autonomous economic actors, but they have no native way to **pay for services programmatically**. OWS Agent Pay bridges this gap:

```
AI Agent calls API → Server returns HTTP 402 → SDK auto-pays → Agent gets result
```

**Zero payment code required from the agent developer.** The SDK intercepts, validates, settles, and retries — all transparently.

> ⚠️ **This is not a hackathon prototype.** We extracted the core x402 payment logic from our **live production stack** (10K+ monthly NPM downloads) into a clean, OWS-compliant SDK.

---

## ⚡ Quick Start

### Option 1: Browser Demo (Zero Install)

> **[▶ Open the live demo →](https://asgcompute.github.io/ASGCompute-ows-agent-pay/)** — click "Run Live Demo" and watch the full x402 cycle in 30 seconds.

### Option 2: CLI Demo

```bash
# Clone and install
git clone https://github.com/ASGCompute/ASGCompute-ows-agent-pay.git
cd ASGCompute-ows-agent-pay
npm install

# Run the demo (simulated mode — no ETH needed)
npx ts-node demo.ts --simulate

# Or run with real Base Sepolia testnet (auto-funds via Coinbase faucet)
npx ts-node demo.ts
```

### Option 3: Use in Your Agent

```typescript
import { OwsClient, BasePaymentAdapter } from 'ows-agent-pay';

const adapter = new BasePaymentAdapter({
  privateKey: process.env.AGENT_PRIVATE_KEY as `0x${string}`,
  network: 'mainnet',
});

const agent = new OwsClient({
  baseURL: 'https://inference-api.example.com',
  policy: {
    monthlyBudget: 100,
    maxAmountPerTransaction: 5,
    allowedDestinations: ['0x...'],
  },
  adapter, // Swap to StellarPaymentAdapter for Stellar
});

// Agent code — no payment logic needed!
const result = await agent.performTask('/v1/chat', {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Summarize this document' }],
});
```

### Expected CLI Output

```
╔══════════════════════════════════════════════════╗
║   OWS Agent Pay — Base/EVM Autonomous Demo      ║
║   Built by ASG Pay  •  https://asgcard.dev       ║
║   x402 Protocol  •  Base (Coinbase L2)           ║
╚══════════════════════════════════════════════════╝

[Server] Mock API listening on http://localhost:4020
[Agent] Wallet: 0xAb5801a7D398991B8a7cF7706226...
[Agent] Chain:  Base Sepolia (eip155:84532)
[Agent] 💧 Requesting ETH from Base Sepolia faucet…
[Agent] ✅ Wallet funded from Coinbase faucet
[Agent] 💰 Balance: 0.1 ETH
[Agent] 🧠 Sending inference request…

[OWS Client] ⚡ Received 402 Payment Required challenge
[OWS Client] 💰 Requested payment: $0.50
[OWS Client] ⛓️  Settlement chain: Base (eip155:84532)
[OWS Client] ✅ Policy check PASSED — settling on-chain…
[Base] 🚀 Building payment → 0xDead71…8B3c4F (0.0005 ETH, Base Sepolia)
[Base] 📡 Submitting transaction…
[Base] ✅ Confirmed — hash: 0x9e8f7a6b5c4d3e2f…
[OWS Client] 🔁 Constructing X-PAYMENT token and retrying…

[AI Agent] ✅ Task completed: The AI model computed the answer...

── 🏁 Demo complete ───────────────────────────
```

---

## 🏗️ Architecture

```
                            ┌──────────────────┐
                            │    AI  Agent      │
                            │  performTask()    │
                            └────────┬─────────┘
                                     │ HTTP POST
                            ┌────────▼─────────┐
                            │   OwsClient       │
                            │  (Axios + 402     │
                            │   interceptor)    │
                            └─┬──────────────┬──┘
                              │              │
               ┌──────────────▼──┐   ┌───────▼───────────┐
               │  PolicyEngine   │   │  PaymentAdapter    │
               │  ┌────────────┐ │   │  (interface)       │
               │  │ Budget     │ │   │                    │
               │  │ Per-tx max │ │   │  ┌──────────────┐  │
               │  │ Allowlist  │ │   │  │ Base (viem)  │  │
               │  └────────────┘ │   │  ├──────────────┤  │
               └─────────────────┘   │  │ Stellar      │  │
                                     │  ├──────────────┤  │
                                     │  │ (Arbitrum…)  │  │
                                     │  └──────────────┘  │
                                     └───────────────────┘
```

| Component | File | Purpose |
|-----------|------|---------|
| **OwsClient** | [`client.ts`](src/client.ts) | Chain-agnostic Axios wrapper with 402 interceptor |
| **PolicyEngine** | [`policy.ts`](src/policy.ts) | Fail-closed budget, per-tx limits, destination allowlist |
| **BasePaymentAdapter** | [`adapters/base.ts`](src/adapters/base.ts) | On-chain settlement via Base (Coinbase L2) using viem |
| **StellarPaymentAdapter** | [`adapters/stellar.ts`](src/adapters/stellar.ts) | On-chain settlement via Stellar network |
| **PaymentAdapter** | [`adapters/types.ts`](src/adapters/types.ts) | Generic interface — plug in any chain (~40 lines) |

---

## 📐 OWS Spec Compliance

| OWS Section | Requirement | Implementation |
|-------------|-------------|----------------|
| **§03 Intercept** | Detect `402 Payment Required` | Axios response interceptor ([`client.ts:44`](src/client.ts#L44)) |
| **§04 Evaluate** | Validate `x402Version` + `accepts[]` | Envelope parser + PolicyEngine ([`policy.ts`](src/policy.ts)) |
| **§05 Settle** | Execute on-chain payment | BasePaymentAdapter / StellarPaymentAdapter |
| **§06 Prove** | Attach `X-PAYMENT` header | Base64-encoded proof with tx hash + CAIP-2 chain ID |
| **§07 Retry** | Resubmit original request | Axios re-request with proof header |
| **§08 Chains** | CAIP-2 chain identifiers | `eip155:8453` (Base), `eip155:84532` (Sepolia), `stellar:testnet` |

---

## 🔐 Policy Engine (Fail-Closed)

Every payment **must** pass **all three** checks before execution:

```typescript
const policy: BudgetPolicy = {
  monthlyBudget: 50.0,           // USD cap per calendar month
  maxAmountPerTransaction: 5.0,  // USD cap per single payment
  allowedDestinations: [         // Whitelist of recipient addresses
    '0xDead7101a13B2B6e2A4497706226bc3c4F',
  ],
};
```

❌ Over budget → **REJECTED**  
❌ Over per-tx limit → **REJECTED**  
❌ Unknown destination → **REJECTED**  
✅ All checks pass → **SETTLED**

---

## ⛓️ Supported Chains

| Chain | Adapter | CAIP-2 | Status |
|-------|---------|--------|--------|
| **Base** (Coinbase L2) | `BasePaymentAdapter` | `eip155:8453` | ✅ Live |
| **Base Sepolia** | `BasePaymentAdapter` | `eip155:84532` | ✅ Testnet |
| **Stellar** | `StellarPaymentAdapter` | `stellar:pubnet` | ✅ Live |
| **Arbitrum** | `EvmPaymentAdapter` | `eip155:42161` | 🔜 Next |
| **Solana** | `SolanaPaymentAdapter` | `solana:mainnet` | 🔜 Planned |
| **Sui** | `SuiPaymentAdapter` | `sui:mainnet` | 🔜 Planned |

> 💡 **Any chain** can be added by implementing the `PaymentAdapter` interface (~40 lines).

---

## 🌐 Live Production Products

> **This is not a hackathon prototype.** Every product below is deployed and serving real traffic right now.

### 🔗 Try them yourself

<table>
<tr>
<td width="33%" align="center">

### 💳 ASG Pay
**Universal Payment Gateway**

The AI agent payment infrastructure.
Accept fiat and crypto across 60+ chains.

**[▶ pay.asgcard.dev](https://pay.asgcard.dev)**

```bash
npm install @asgcard/pay
```

</td>
<td width="33%" align="center">

### 💰 ASG Fund
**Agent Wallet Funding**

Top up any AI agent's wallet with
USDC on Stellar — via card, bank, or stablecoin.

**[▶ fund.asgcard.dev](https://fund.asgcard.dev)**

```bash
npm install @asgcard/fund
```

</td>
<td width="33%" align="center">

### 🃏 ASG Card
**Virtual Cards for AI Agents**

Issue virtual debit cards on demand.
Pay via x402 or Stripe Machine Payments.

**[▶ asgcard.dev](https://asgcard.dev)**

```bash
npx @asgcard/cli
```

</td>
</tr>
</table>

### 📦 NPM Packages

| Package | Install | Downloads | Description |
|---------|---------|-----------|-------------|
| **@asgcard/pay** | `npm i @asgcard/pay` | [![npm](https://img.shields.io/npm/dm/@asgcard/pay?color=22c55e)](https://www.npmjs.com/package/@asgcard/pay) | Core payment SDK |
| **@asgcard/fund** | `npm i @asgcard/fund` | [![npm](https://img.shields.io/npm/dm/@asgcard/fund?color=22c55e)](https://www.npmjs.com/package/@asgcard/fund) | Payment link generator CLI |
| **@asgcard/cli** | `npx @asgcard/cli` | [![npm](https://img.shields.io/npm/dm/@asgcard/cli?color=22c55e)](https://www.npmjs.com/package/@asgcard/cli) | Virtual card issuing CLI |

### 🎮 Interactive Demos

| Demo | URL | What You'll See |
|------|-----|-----------------|
| **Browser Demo** | [▶ index.html](https://asgcompute.github.io/ASGCompute-ows-agent-pay/) | Full x402 cycle: 402 → Policy → Settlement → Proof → Result. Zero install. |
| **Ecosystem Demo** | [▶ ecosystem.html](https://asgcompute.github.io/ASGCompute-ows-agent-pay/ecosystem.html) | 3 interactive tabs: Fund Agent → Issue Card → x402 Pay — each with live terminal. |
| **Fund Agent** | [▶ fund.asgcard.dev](https://fund.asgcard.dev) | Real agent wallet ($14.37 USDC + XLM on Stellar mainnet). |
| **Issue Card** | [▶ asgcard.dev](https://asgcard.dev) | Virtual debit card issuance for AI agents via x402 + Stripe. |

---

## 🏆 Hackathon Track Alignment

| Track | Alignment |
|-------|-----------|
| **💰 Payments** | ⭐ Core — x402 autonomous settlement on Base |
| **🤖 AI Agents** | ⭐ Core — transparent payment layer for agents |
| **🔒 Agent Spend Governance** | ⭐ Core — PolicyEngine (fail-closed budget control) |
| **🔗 Interoperability** | Multi-chain adapters via CAIP-2 |
| **🏗️ Infrastructure** | Production SDK + ASG Pay ecosystem |

### 🤝 Sponsor & Partner Alignment

<table>
<tr>
<td align="center" width="14%">
<a href="https://base.org">
<img src="https://img.shields.io/badge/Base-0052FF?style=for-the-badge&logo=coinbase&logoColor=white" alt="Base" />
</a>
<br><sub>Primary settlement<br/>Native x402 chain</sub>
</td>
<td align="center" width="14%">
<a href="https://circle.com">
<img src="https://img.shields.io/badge/Circle-00D632?style=for-the-badge&logoColor=white" alt="Circle" />
</a>
<br><sub>USDC settlement<br/>EVM + Stellar</sub>
</td>
<td align="center" width="14%">
<a href="https://stellar.org">
<img src="https://img.shields.io/badge/Stellar-7C3AED?style=for-the-badge" alt="Stellar" />
</a>
<br><sub>Production adapter<br/>Mainnet USDC</sub>
</td>
<td align="center" width="14%">
<a href="https://arbitrum.io">
<img src="https://img.shields.io/badge/Arbitrum-28A0F0?style=for-the-badge" alt="Arbitrum" />
</a>
<br><sub>EVM adapter<br/>Roadmap</sub>
</td>
<td align="center" width="14%">
<a href="https://stripe.com">
<img src="https://img.shields.io/badge/Stripe-635BFF?style=for-the-badge&logo=stripe&logoColor=white" alt="Stripe" />
</a>
<br><sub>Fiat settlement<br/>fund.asgcard.dev</sub>
</td>
<td align="center" width="14%">
<a href="https://li.fi">
<img src="https://img.shields.io/badge/LI.FI-EB46FF?style=for-the-badge" alt="Li.Fi" />
</a>
<br><sub>Cross-chain<br/>Aggregator</sub>
</td>
<td align="center" width="14%">
<a href="https://rozo.com">
<img src="https://img.shields.io/badge/ROZO-00BFFF?style=for-the-badge" alt="ROZO" />
</a>
<br><sub>Bridging<br/>Partner</sub>
</td>
</tr>
</table>

---

## 🛣️ Roadmap

- [x] **OWS-compliant 402 interceptor** with policy engine
- [x] **Base adapter** (viem, Coinbase L2 — native x402 chain)
- [x] **Stellar adapter** (production-proven via ASG Pay)
- [x] **Multi-chain adapter interface** (CAIP-2)
- [x] **Interactive browser demo** (GitHub Pages)
- [x] **Full ecosystem demo** (Fund → Card → Pay lifecycle)
- [ ] **Arbitrum / OP Stack** adapters
- [ ] **Solana adapter** (via @solana/web3.js)
- [ ] **Li.Fi integration** (cross-chain settlement aggregator)
- [ ] **MCP tool server** (A2A protocol bridge)
- [ ] **USDC (ERC-20)** transfer support on Base

---

## 📊 Key Metrics

| Metric | Value |
|--------|-------|
| **NPM Downloads** | 10K+ monthly ([@asgcard](https://www.npmjs.com/org/asgcard)) |
| **SDK Size** | ~529 lines TypeScript |
| **Dependencies** | 3 (viem, axios, @stellar/stellar-sdk) |
| **Chains Live** | 2 (Base + Stellar) |
| **Products Live** | 3 (pay, fund, card) — all in production |
| **OWS Compliance** | 6/6 specification sections |
| **License** | MIT |

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

### Built with ❤️ by [ASG Compute](https://github.com/ASGCompute)

[pay.asgcard.dev](https://pay.asgcard.dev) • [fund.asgcard.dev](https://fund.asgcard.dev) • [asgcard.dev](https://asgcard.dev)

*Autonomous payments for autonomous agents.*

**[▶ Try the Live Demo](https://asgcompute.github.io/ASGCompute-ows-agent-pay/) • [📦 NPM](https://www.npmjs.com/org/asgcard) • [🐦 Twitter](https://x.com/asgcard)**

</div>
