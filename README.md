<![CDATA[<div align="center">

# 🏦 ASG Pay

### The banking layer for autonomous AI agents

*Give every agent a financial identity — in one line of code.*

<br/>

[![npm version](https://img.shields.io/npm/v/@asgcard/pay?style=flat-square&color=CB3837&logo=npm&logoColor=white&label=@asgcard/pay)](https://www.npmjs.com/package/@asgcard/pay)
[![npm downloads](https://img.shields.io/npm/dw/@asgcard/pay?style=flat-square&color=4DC71F&logo=npm&logoColor=white)](https://www.npmjs.com/package/@asgcard/pay)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)

**17 networks** · **Dual protocol (x402 + MPP)** · **Virtual cards** · **Policy engine** · **Wallet abstraction**

[Quick Start](#-quick-start) · [Architecture](#-architecture) · [Networks](#-supported-networks) · [Ecosystem](#-ecosystem) · [Website](https://pay.asgcard.dev)

<br/>

---

### 🏆 Award-Winning Infrastructure

<table>
<tr>
<td align="center" width="50%">

**🥇 OWS Hackathon Winner**<br/>
<sub>First-ever Open Wallet Standard Hackathon</sub><br/>
<sub>Recognized for pioneering agent financial identity<br/>using the Open Wallet Standard</sub>

</td>
<td align="center" width="50%">

**🥉 Build X: Season 2 — 3rd Place**<br/>
<sub>X Layer Ecosystem Hackathon</sub><br/>
<sub>Awarded for production-grade x402 payment<br/>infrastructure for the agentic economy</sub>

</td>
</tr>
</table>

---

</div>

## ⚡ What is ASG Pay?

ASG Pay is the **only SDK** that unifies [Coinbase x402](https://x402.org) and [Stripe Machine Payments Protocol](https://docs.stripe.com/machine-payments) into a single interface for AI agents.

```
Agent → ASG Pay SDK → x402 or Stripe MPP → Virtual Mastercard → Real-world spending
```

**One integration. 17 networks. Three payment rails. Zero API keys for crypto.**

| Capability | Description |
|---|---|
| 🔗 **Multi-chain payments** | EVM (Base, Arbitrum, Optimism, Polygon, Ethereum, X Layer), Stellar, Solana |
| 💳 **Virtual card issuance** | Instant Mastercard via 4Payments — agents spend in the real world |
| 🛡️ **Policy engine** | Fail-closed, per-agent spending limits, rate limiting, network restrictions |
| 🔄 **Dual protocol** | x402 (crypto-native, zero API keys) + Stripe MPP (fiat, global cards) |
| 🧩 **Open Wallet Standard** | OWS-compatible adapters — plug into any wallet or chain |
| 📊 **Agent identity** | DID-based identity, key management, wallet abstraction |

## 🚀 Quick Start

### Installation

```bash
npm install @asgcard/pay
```

### Create an agent with a financial identity — in one line

```typescript
import { AgentPay } from '@asgcard/pay';

// One line — agent is ready to pay on any network
const agent = new AgentPay({ network: 'base', asset: 'USDC' });
```

### Pay for an API call via x402

```typescript
import { EvmPaymentAdapter } from '@asgcard/pay';

// Agent pays for API access — zero API keys needed
const adapter = new EvmPaymentAdapter({
  chain: 'base',
  asset: 'USDC',
  privateKey: process.env.AGENT_KEY as `0x${string}`,
});

const response = await fetch('https://api.example.com/data', {
  headers: {
    'X-PAYMENT': await adapter.createPaymentHeader({
      amount: '1000000', // 1 USDC (6 decimals)
      destination: '0x...',
      network: 'eip155:8453',
    }),
  },
});
```

### Get a virtual Mastercard

```typescript
import { ASGCardSDK } from '@asgcard/pay';

const sdk = new ASGCardSDK({ apiKey: process.env.ASG_API_KEY });

// Agent gets a virtual Mastercard funded with USDC
const card = await sdk.cards.create({
  amount: 100,        // $100 USD
  currency: 'USD',
  label: 'agent-shopping',
});

console.log(card.number, card.expiry, card.cvv);
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent                                │
│                   @asgcard/pay SDK                            │
├──────────┬──────────────┬──────────────┬────────────────────┤
│  Stellar │   EVM (x402) │    Solana    │    Stripe MPP      │
│  Adapter │   Adapter    │    Adapter   │    Adapter         │
├──────────┴──────────────┴──────────────┴────────────────────┤
│                    Policy Engine                             │
│         (fail-closed · rate-limit · spend-cap)               │
├─────────────────────────────────────────────────────────────┤
│                  Payment Router                              │
│        x402 Protocol ←──────→ Stripe MPP                     │
├──────────┬──────────────────────────────┬───────────────────┤
│ Coinbase │     Self-hosted              │     Stripe        │
│ x402     │     Facilitator              │     Machine       │
│ Facilit. │     (SKALE, custom)          │     Payments      │
├──────────┴──────────────────────────────┴───────────────────┤
│              Settlement Networks                             │
│  Base · Arbitrum · Optimism · Polygon · Ethereum · X Layer   │
│  Stellar · Solana · SKALE (gasless, coming soon)             │
├─────────────────────────────────────────────────────────────┤
│              Card Issuance (4Payments.io)                    │
│           Virtual Mastercard · Instant · Global              │
└─────────────────────────────────────────────────────────────┘
```

## 🌐 Supported Networks

### EVM Chains (x402)

| Network | Chain ID | USDC | Status |
|---|---|---|---|
| **Base** | `eip155:8453` | ✅ Circle native | 🟢 Production |
| **Base Sepolia** | `eip155:84532` | ✅ Testnet | 🟢 Testnet |
| **Arbitrum One** | `eip155:42161` | ✅ Circle native | 🟢 Production |
| **Arbitrum Sepolia** | `eip155:421614` | ✅ Testnet | 🟢 Testnet |
| **Optimism** | `eip155:10` | ✅ Circle native | 🟢 Production |
| **Optimism Sepolia** | `eip155:11155420` | ✅ Testnet | 🟢 Testnet |
| **Ethereum** | `eip155:1` | ✅ Circle native | 🟢 Production |
| **Ethereum Sepolia** | `eip155:11155111` | ✅ Testnet | 🟢 Testnet |
| **Polygon** | `eip155:137` | ✅ Circle native | 🟢 Production |
| **Polygon Amoy** | `eip155:80002` | — | 🟢 Testnet |
| **X Layer** | `eip155:196` | ✅ Bridged | 🟢 Production |
| **X Layer Testnet** | `eip155:195` | — | 🟢 Testnet |

### Non-EVM Chains

| Network | Protocol | Status |
|---|---|---|
| **Stellar (pubnet)** | x402 v2 | 🟢 Production |
| **Stellar (testnet)** | x402 v2 | 🟢 Testnet |
| **Solana (mainnet)** | Native SPL | 🟢 Production |
| **Solana (devnet/testnet)** | Native SPL | 🟢 Testnet |

### Fiat Rails

| Provider | Protocol | Status |
|---|---|---|
| **Stripe** | Machine Payments Protocol (MPP) | 🟢 Production |

### Coming Soon

| Network | Highlight | Status |
|---|---|---|
| **SKALE Europa Hub** | ⚡ Zero gas fees — ideal for agent micropayments | 🟡 Integration complete, deployment pending |

## 📦 Ecosystem

ASG Pay is a full ecosystem of packages for agent-native finance:

| Package | Description | npm |
|---|---|---|
| [`@asgcard/pay`](https://www.npmjs.com/package/@asgcard/pay) | Core SDK — multi-chain payments, adapters, policy engine | [![npm](https://img.shields.io/npm/v/@asgcard/pay?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@asgcard/pay) |
| [`@asgpay/sdk`](https://www.npmjs.com/package/@asgpay/sdk) | Card management API — create, fund, manage virtual cards | [![npm](https://img.shields.io/npm/v/@asgpay/sdk?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@asgpay/sdk) |
| [`@asgpay/cli`](https://www.npmjs.com/package/@asgpay/cli) | CLI tool — manage agents and cards from terminal | [![npm](https://img.shields.io/npm/v/@asgpay/cli?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@asgpay/cli) |
| [`@asgpay/mcp-server`](https://www.npmjs.com/package/@asgpay/mcp-server) | MCP server — integrate with Claude, Cursor, Windsurf | [![npm](https://img.shields.io/npm/v/@asgpay/mcp-server?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@asgpay/mcp-server) |
| [`@asgpay/fund`](https://www.npmjs.com/package/@asgpay/fund) | Wallet funding utility | [![npm](https://img.shields.io/npm/v/@asgpay/fund?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@asgpay/fund) |
| [`@asgpay/agent-cash`](https://www.npmjs.com/package/@asgpay/agent-cash) | Agent onboarding — instant wallet + card setup | [![npm](https://img.shields.io/npm/v/@asgpay/agent-cash?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@asgpay/agent-cash) |
| [`@asgpay/create-app`](https://www.npmjs.com/package/@asgpay/create-app) | Project scaffolding — `npx @asgpay/create-app` | [![npm](https://img.shields.io/npm/v/@asgpay/create-app?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@asgpay/create-app) |
| [`@asgpay/pay`](https://www.npmjs.com/package/@asgpay/pay) | Re-export of `@asgcard/pay` under the `@asgpay` scope | [![npm](https://img.shields.io/npm/v/@asgpay/pay?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@asgpay/pay) |

## 🔧 Adapters

### EVM Adapter (Base, Arbitrum, Optimism, Polygon, Ethereum, X Layer)

```typescript
import { EvmPaymentAdapter } from '@asgcard/pay';

const adapter = new EvmPaymentAdapter({
  chain: 'arbitrum',      // any supported chain
  asset: 'USDC',          // 'USDC' or 'native'
  privateKey: '0x...',
});

const address = adapter.getAddress();
const balance = await adapter.getUsdcBalance();
const txHash = await adapter.pay(destination, amount, network);
```

### Stellar Adapter

```typescript
import { StellarPaymentAdapter } from '@asgcard/pay';

const adapter = new StellarPaymentAdapter({
  network: 'pubnet',
  secretKey: 'S...',
});
```

### Solana Adapter

```typescript
import { SolanaPaymentAdapter } from '@asgcard/pay';

const adapter = new SolanaPaymentAdapter({
  network: 'mainnet-beta',
  privateKey: new Uint8Array([...]),
});
```

### Stripe MPP Adapter

```typescript
import { StripePaymentAdapter } from '@asgcard/pay';

const adapter = new StripePaymentAdapter({
  apiKey: process.env.STRIPE_SECRET,
});
```

## 🛡️ Policy Engine

ASG Pay uses a **fail-closed** policy engine — if a payment doesn't explicitly pass all checks, it's denied:

```typescript
import { PolicyEngine, AgentPolicy } from '@asgcard/pay';

const policy: AgentPolicy = {
  maxTransactionAmount: 1000_000000,  // 1000 USDC max per tx
  dailySpendLimit: 5000_000000,       // 5000 USDC daily cap
  allowedNetworks: ['eip155:8453', 'stellar:pubnet'],
  rateLimit: { maxRequests: 100, windowMs: 60_000 },
};

const engine = new PolicyEngine(policy);
const result = engine.evaluate(transaction);
// { allowed: true } or { allowed: false, reason: '...' }
```

## 🤝 Integrations

ASG Pay works seamlessly with popular AI frameworks:

| Framework | Integration |
|---|---|
| **LangChain** | Custom tool for agent payment actions |
| **CrewAI** | Payment capability for crew agents |
| **AutoGPT** | Plugin for autonomous spending |
| **Claude (MCP)** | `@asgpay/mcp-server` for direct integration |
| **Cursor / Windsurf** | MCP server support |

## 📄 API Reference

Full documentation: **[pay.asgcard.dev/docs](https://pay.asgcard.dev/docs)**

| Endpoint | Description |
|---|---|
| `POST /v1/cards/create` | Create a virtual Mastercard |
| `GET /v1/cards/:id` | Get card details |
| `POST /v1/cards/:id/fund` | Add funds to a card |
| `GET /v1/agents/:id/balance` | Check agent balance |

## 🔐 Security

- **Fail-closed policy engine** — deny by default
- **Anti-replay protection** — unique transaction hash enforcement
- **Network-locked treasury** — cross-network payments cannot leak funds
- **Feature-flagged rollouts** — new payment rails are gated behind env toggles

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## 🗺️ Roadmap

- [x] Multi-chain EVM support (12 networks)
- [x] Stellar x402 integration
- [x] Solana SPL payments
- [x] Stripe Machine Payments Protocol
- [x] Policy engine with fail-closed design
- [x] Agent identity (DID-based)
- [x] 🏆 OWS Hackathon — Winner
- [x] 🏆 Build X: Season 2 — 3rd Place
- [ ] ⚡ SKALE Europa Hub integration (gasless payments)
- [ ] Cross-chain bridge (USDC settlement across chains)
- [ ] Agent-to-agent payment channels
- [ ] Subscription management for AI services

## 📝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/ASGCompute/ASGCompute-ows-agent-pay.git
cd ASGCompute-ows-agent-pay
npm install
npm test
```

## 📜 License

[Apache License 2.0](LICENSE) — ASG Compute

---

<div align="center">

**Built by [ASG Compute](https://asgcompute.com)**

[pay.asgcard.dev](https://pay.asgcard.dev) · [fund.asgcard.dev](https://fund.asgcard.dev) · [asgcard.dev](https://asgcard.dev)

[📦 npm](https://www.npmjs.com/package/@asgcard/pay) · [𝕏 @ASGCardx402](https://x.com/ASGCardx402) · [GitHub](https://github.com/ASGCompute/ASGCompute-ows-agent-pay)

</div>
]]>
