<div align="center">

# 🚀 OWS Agent Pay

### Autonomous Payment SDK for AI Agents

**OWS-compliant** • **x402 Protocol** • **Multi-chain** • **Policy-gated**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OWS v1.0.0](https://img.shields.io/badge/OWS-v1.0.0-00D4FF)](https://openwallet.sh)
[![x402](https://img.shields.io/badge/x402-Protocol-FF6B35)](https://x402.org)
[![Base](https://img.shields.io/badge/Base-0052FF?logo=coinbase&logoColor=white)](https://base.org)
[![Stellar](https://img.shields.io/badge/Stellar-7C3AED)](https://stellar.org)
[![Built by ASG Pay](https://img.shields.io/badge/Built_by-ASG_Pay-00FF88)](https://pay.asgcard.dev)

*The AI agent simply calls `performTask()` — the SDK handles payment, policy validation, on-chain settlement, and proof generation transparently.*

[Documentation](https://pay.asgcard.dev) • [Demo](#-quick-start) • [Architecture](#-architecture) • [OWS Compliance](#-ows-spec-compliance)

</div>

---

## 💡 What This Solves

AI agents are rapidly becoming autonomous economic actors, but they have no native way to **pay for services programmatically**. OWS Agent Pay bridges this gap:

```
AI Agent calls API → Server returns HTTP 402 → SDK auto-pays → Agent gets result
```

**Zero payment code required from the agent developer.** The SDK intercepts, validates, settles, and retries — all transparently.

---

## ⚡ Quick Start

```bash
# Clone and install
git clone https://github.com/ASGCompute/ASGCompute-ows-agent-pay.git
cd ASGCompute-ows-agent-pay
npm install

# Run the Base Sepolia demo (auto-funds from Coinbase faucet)
npx ts-node demo.ts
```

### Expected Output

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

| Component | Purpose |
|-----------|---------|
| **OwsClient** | Chain-agnostic Axios wrapper with 402 interceptor |
| **PolicyEngine** | Fail-closed budget, per-tx limits, destination allowlist |
| **BasePaymentAdapter** | On-chain settlement via Base (Coinbase L2) using viem |
| **StellarPaymentAdapter** | On-chain settlement via Stellar network |
| **PaymentAdapter** | Generic interface — plug in any chain |

---

## 📐 OWS Spec Compliance

| OWS Section | Requirement | Implementation |
|-------------|-------------|----------------|
| **§03 Intercept** | Detect `402 Payment Required` | Axios response interceptor (`client.ts:46`) |
| **§04 Evaluate** | Validate `x402Version` + `accepts[]` | Envelope parser + PolicyEngine (`policy.ts`) |
| **§05 Settle** | Execute on-chain payment | BasePaymentAdapter (viem) / StellarPaymentAdapter |
| **§06 Prove** | Attach `X-PAYMENT` header | Base64-encoded proof with tx hash + CAIP-2 chain ID |
| **§07 Retry** | Resubmit original request | Axios re-request with proof header |
| **§08 Chains** | CAIP-2 chain identifiers | `eip155:8453` (Base), `eip155:84532` (Base Sepolia), `stellar:testnet` |

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

## 🌐 ASG Pay Ecosystem

OWS Agent Pay is the open-source SDK at the core of the **ASG Pay** production infrastructure:

| Product | URL | Description |
|---------|-----|-------------|
| **ASG Pay** | [pay.asgcard.dev](https://pay.asgcard.dev) | Landing & developer documentation |
| **ASG Fund** | [fund.asgcard.dev](https://fund.asgcard.dev) | Payment link generator for AI agent funding |
| **ASG Card** | [asgcard.dev](https://asgcard.dev) | Virtual card issuing for AI agents |
| **@asgcard/fund** | [NPM](https://www.npmjs.com/package/@asgcard/fund) | CLI tool for programmatic payment links |
| **@asgcard/pay** | [NPM](https://www.npmjs.com/package/@asgcard/pay) | Core payment SDK (100K+ downloads) |

---

## 🛣️ Roadmap

- [x] **OWS-compliant 402 interceptor** with policy engine
- [x] **Base adapter** (viem, Coinbase L2 — native x402 chain)
- [x] **Stellar adapter** (production-proven via ASG Pay)
- [x] **Multi-chain adapter interface** (CAIP-2)
- [ ] **Arbitrum / OP Stack** adapters
- [ ] **Solana adapter** (via @solana/web3.js)
- [ ] **Li.Fi integration** (cross-chain settlement aggregator)
- [ ] **MCP tool server** (A2A protocol bridge)
- [ ] **USDC (ERC-20)** transfer support on Base

---

## 🏆 Hackathon Track Alignment

| Track | Alignment |
|-------|-----------|
| **💰 Payments** | Core — x402 autonomous settlement on Base |
| **🤖 AI Agents** | Core — transparent payment layer for agents |
| **🔗 Interoperability** | Multi-chain adapters via CAIP-2 |
| **🏗️ Infrastructure** | Production SDK + ASG Pay ecosystem |

### Sponsor Alignment

- **Base (Coinbase)** — Primary settlement chain, native x402
- **Circle (USDC)** — Settlement asset on EVM chains
- **Arbitrum** — EVM adapter roadmap (same `viem` stack)
- **Stellar** — Production adapter (ASG Pay mainnet)
- **Li.Fi** — Cross-chain settlement aggregator (roadmap)

---

## 🧑‍💻 Usage in Your Agent

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

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built by [ASG Pay](https://pay.asgcard.dev) • [asgcard.dev](https://asgcard.dev)**

*Autonomous payments for autonomous agents.*

</div>
