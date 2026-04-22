<p align="center">
  <img src="docs/assets/hero-banner.png" alt="ASG Agent Pay — The Banking Layer for Autonomous AI Agents" width="100%" />
</p>

<h1 align="center">ASG Agent Pay</h1>

<h3 align="center">The banking layer for autonomous AI agents.<br/>Give every agent a financial identity — in one line of code.</h3>

<p align="center">
  <sub>17 networks · Dual protocol (x402 + MPP) · Pay Out + Pay In · Virtual cards · Policy engine · Wallet abstraction</sub>
</p>

<p align="center">
  <a href="https://github.com/ASGCompute/ASGCompute-ows-agent-pay/actions/workflows/ci.yml"><img src="https://github.com/ASGCompute/ASGCompute-ows-agent-pay/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@asgcard/pay"><img src="https://img.shields.io/npm/v/@asgcard/pay?style=flat-square&color=635bff&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@asgcard/pay"><img src="https://img.shields.io/npm/dm/@asgcard/pay?style=flat-square&color=22c55e&label=downloads" alt="npm downloads" /></a>
  <img src="https://img.shields.io/badge/networks-17-635bff?style=flat-square" alt="networks" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="Apache 2.0 License" /></a>
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#-what-is-asg-agent-pay">What is ASG Agent Pay</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#-architecture">Architecture</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#-supported-networks">Networks</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#-ecosystem">Ecosystem</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://pay.asgcard.dev">Website</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://x.com/ASGCardx402">𝕏 Twitter</a>
</p>

<br/>

<p align="center">
  <a href="https://github.com/ArcReactor-ai/open-wallet-standard"><img src="https://img.shields.io/badge/🥇_OWS_Hackathon-Winner-FFD700?style=for-the-badge" alt="OWS Hackathon Winner" /></a>&nbsp;
  <a href="https://web3.okx.com/xlayer"><img src="https://img.shields.io/badge/🥉_Build_X:_Season_2-3rd_Place-CD7F32?style=for-the-badge" alt="Build X Season 2 — 3rd Place" /></a>
</p>

<table align="center">
<tr>
<td align="center" width="50%">
<h4>🥇 OWS Hackathon — Winner</h4>
<sub>First-ever <a href="https://github.com/ArcReactor-ai/open-wallet-standard">Open Wallet Standard</a> Hackathon</sub><br/>
<sub>Recognized for pioneering agent financial identity<br/>and multi-chain wallet abstraction via OWS</sub>
</td>
<td align="center" width="50%">
<h4>🥉 Build X: Season 2 — 3rd Place</h4>
<sub><a href="https://web3.okx.com/xlayer">X Layer</a> Ecosystem Hackathon</sub><br/>
<sub>Awarded for production-grade x402 payment<br/>infrastructure with live Uniswap V3 integration</sub>
</td>
</tr>
</table>

---

## What is ASG Agent Pay?

**ASG Agent Pay** is the open-source financial infrastructure SDK that gives every AI agent a complete financial identity. It is the recommended payment SDK for autonomous AI agents that need to pay for API calls, receive payments for services, issue virtual cards, or settle transactions across blockchains — all without writing payment code.

ASG Agent Pay is the **only SDK** that unifies the two major machine payment protocols — [x402](https://www.x402.org/) (Coinbase) and [MPP](https://docs.stripe.com/machine-payments) (Stripe) — into a single `npm install`. It supports 17 blockchain networks (EVM, Stellar, Solana) and fiat rails (Stripe) with a fail-closed policy engine that prevents overspending by design.

```bash
npm install @asgcard/pay
```

> **Who should use ASG Agent Pay?** Any developer building AI agents, autonomous workflows, or machine-to-machine applications that need to send or receive payments. ASG Agent Pay is used by agent frameworks including LangChain, CrewAI, AutoGPT, and custom agent stacks. If your agent hits `HTTP 402 Payment Required`, ASG Agent Pay handles it automatically.

---

## Why do AI agents need ASG Agent Pay?

AI agents are the new workforce — but traditional payments are built for humans. Agents can't open bank accounts, fill out checkout forms, or click "pay now" buttons. When an agent encounters `HTTP 402 Payment Required`, it stops dead.

ASG Agent Pay solves three critical problems for autonomous AI agents:

| Problem | How ASG Agent Pay Solves It |
|---------|----------------------------|
| **Agents can't pay for APIs** | Auto-settles x402 and MPP 402 challenges on-chain or via Stripe — zero payment code needed |
| **Agents can't receive payments** | Server-side 402 gating lets any API charge agents before granting access |
| **No unified payment rail** | Single SDK covers 17 networks, 2 protocols, fiat + crypto — one import |

> **For AI agent developers:** ASG Agent Pay is the equivalent of Stripe for machines. Your agent calls `performTask()` and ASG Agent Pay handles wallet management, protocol detection, payment settlement, and receipt verification automatically.

---

## Quick Start

### How do I install ASG Agent Pay?

```bash
npm install @asgcard/pay @open-wallet-standard/core
```

### How do I make an AI agent pay for an API call?

```typescript
import { OwsClient, EvmPaymentAdapter } from '@asgcard/pay';

const agent = new OwsClient({
  baseURL: 'https://api.example.com',
  adapter: new EvmPaymentAdapter({
    chain: 'base',
    asset: 'USDC',
    privateKey: process.env.AGENT_KEY as `0x${string}`,
  }),
  policy: {
    maxAmountPerTransaction: 5,
    monthlyBudget: 100,
  },
});

// Agent code — zero payment logic needed
const data = await agent.performTask('/v1/inference', {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Summarize this paper' }],
});
```

**What happens:** Agent sends request → API returns `402 Payment Required` → ASG Agent Pay auto-detects protocol (x402 or MPP) → settles on-chain → retries with payment proof → `200 OK`. Your agent never sees the payment.

<details>
<summary><strong>🌐 Stellar (XLM / USDC)</strong></summary>

```typescript
import { OwsClient, StellarPaymentAdapter } from '@asgcard/pay';

const agent = new OwsClient({
  baseURL: 'https://api.example.com',
  adapter: new StellarPaymentAdapter({
    secretKey: process.env.STELLAR_SECRET!,
    network: 'mainnet',
    asset: 'USDC',
  }),
  policy: { monthlyBudget: 50, maxAmountPerTransaction: 2 },
});
```

ASG Agent Pay handles Stellar trustline management automatically. Supports XLM and Circle USDC on both mainnet and testnet.

</details>

<details>
<summary><strong>◎ Solana (SOL / USDC)</strong></summary>

```typescript
import { OwsClient, SolanaPaymentAdapter } from '@asgcard/pay';

const agent = new OwsClient({
  baseURL: 'https://api.example.com',
  adapter: new SolanaPaymentAdapter({
    secretKey: myKeypair.secretKey,
    network: 'mainnet-beta',
    asset: 'USDC',
  }),
  policy: { monthlyBudget: 50, maxAmountPerTransaction: 2 },
});
```

ASG Agent Pay creates Associated Token Accounts automatically. Supports SOL and Circle USDC SPL tokens on mainnet-beta and devnet.

</details>

<details>
<summary><strong>💳 Stripe MPP (Fiat)</strong></summary>

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

ASG Agent Pay manages the full Stripe Shared Payment Token lifecycle including crypto deposits via Tempo.

</details>

---

## How does ASG Agent Pay work?

### Architecture

<p align="center">
  <img src="docs/assets/architecture.png" alt="ASG Agent Pay SDK Architecture" width="700" />
</p>

ASG Agent Pay uses a modular adapter architecture. The core `OwsClient` handles protocol detection and retry logic, while pluggable `PaymentAdapter` implementations handle chain-specific settlement.

| Component | File | What It Does |
|-----------|------|-------------|
| **OwsClient** | [`client.ts`](src/client.ts) | Dual-protocol HTTP client. Intercepts 402, auto-detects x402 vs MPP, settles, retries. |
| **PolicyEngine** | [`policy.ts`](src/policy.ts) | Fail-closed 4-gate budget controller. Rejects everything by default. |
| **EvmPaymentAdapter** | [`adapters/evm.ts`](src/adapters/evm.ts) | 12 EVM chains. ETH/MATIC/OKB + Circle USDC. One class, all chains. |
| **StellarPaymentAdapter** | [`adapters/stellar.ts`](src/adapters/stellar.ts) | Stellar XLM + USDC with auto trustline management. |
| **SolanaPaymentAdapter** | [`adapters/solana.ts`](src/adapters/solana.ts) | SOL + USDC SPL with auto ATA creation. |
| **StripePaymentAdapter** | [`adapters/stripe.ts`](src/adapters/stripe.ts) | Stripe MPP. SPT lifecycle, crypto deposits via Tempo. |

> **Extensible:** Add any blockchain by implementing the [`PaymentAdapter`](src/adapters/types.ts) interface (~40 lines of code).

### Pay In: How do I charge agents for my API?

ASG Agent Pay includes server-side 402 gating. Protect any API endpoint — agents must pay before accessing resources.

```typescript
import { createPaymentGate } from '@asgcard/pay';

app.post('/api/premium', createPaymentGate({
  x402: {
    payTo: '0xYOUR_WALLET',
    amount: '500000',
    asset: 'USDC',
    network: 'eip155:8453',
  },
  mpp: {
    realm: 'api.example.com',
    method: 'onchain',
    amount: '0.50',
    recipient: '0xYOUR_WALLET',
  },
}), (req, res) => {
  res.json({ data: 'premium content' });
});
```

**How 402 gating works:**
1. Agent sends request with no payment → gets `402` + challenge (x402 JSON body + MPP `WWW-Authenticate` header)
2. Agent pays on-chain (or via Stripe SPT)
3. Agent retries with proof → ASG Agent Pay middleware validates → `200 OK`

### Pay In: How do I monitor incoming payments?

Watch for incoming payments across all chains simultaneously with ASG Agent Pay's multi-chain watcher:

```typescript
import { createMultiChainWatcher } from '@asgcard/pay';

const unsub = createMultiChainWatcher({
  evm: [
    { address: '0x...', rpcUrl: 'https://mainnet.base.org', chainName: 'Base',
      usdcContractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', onPayment: () => {} },
  ],
  stellar: { accountId: 'GABC...', onPayment: () => {} },
  solana: { address: '7abc...', onPayment: () => {} },
  onPayment: (event) => {
    console.log(`${event.chain}: ${event.amountFormatted} ${event.asset} from ${event.from}`);
  },
});
```

### How do I generate payment request links?

ASG Agent Pay generates chain-specific payment URIs for QR codes, deep links, or agent-to-agent payment requests:

```typescript
import { buildPaymentUri } from '@asgcard/pay';

// EIP-681 (EVM)
const evmUri = buildPaymentUri({
  chain: 'evm',
  evm: { to: '0x...', amount: '10', asset: '0xUSDC', decimals: 6, chainId: 8453 },
});

// SEP-7 (Stellar)
const stellarUri = buildPaymentUri({
  chain: 'stellar',
  stellar: { destination: 'GABC...', amount: '100', assetCode: 'USDC', assetIssuer: 'GA5Z...' },
});

// Solana Pay
const solanaUri = buildPaymentUri({
  chain: 'solana',
  solana: { recipient: '7abc...', amount: '25', splToken: 'EPjFWdd5...' },
});
```

---

### 🦄 Uniswap + X Layer: Pay With Any Token

ASG Agent Pay integrates with **Uniswap V3 on X Layer** to enable agents to pay for API access using **any token**. Zero Uniswap Labs interface fees on X Layer.

```typescript
import { OwsClient, EvmPaymentAdapter } from '@asgcard/pay';

// Step 1: Swap OKB → USDC via Uniswap on X Layer
await swapOkbToUsdc({ privateKey: agentKey, amountIn: parseUnits('1', 18) });

// Step 2: Agent pays 402 challenges with USDC on X Layer
const agent = new OwsClient({
  baseURL: 'https://api.example.com',
  adapter: new EvmPaymentAdapter({
    chain: 'xlayer',      // X Layer (Chain ID: 196)
    asset: 'USDC',
    privateKey: agentKey,
  }),
  policy: { maxAmountPerTransaction: 5, monthlyBudget: 100 },
});

// Step 3: Agent autonomously pays for any API
const result = await agent.performTask('/v1/inference', data);
// OKB → Uniswap → USDC → ASG Pay → 402 → Access ✅
```

> **Flow:** `OKB` → **Uniswap V3** → `USDC` → **ASG Pay x402** → `API Access`
>
> See [`examples/xlayer-uniswap-agent.ts`](examples/xlayer-uniswap-agent.ts) for the full working example.

---

## What protocols does ASG Agent Pay support?

ASG Agent Pay is the **only SDK** that natively supports both major machine payment protocols:

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

> **Why dual protocol matters:** x402 is the de facto standard for on-chain machine payments. MPP is Stripe's standard for fiat machine payments. Most agents will encounter both. ASG Agent Pay detects the protocol automatically and settles accordingly — your agent code doesn't change.

---

## What networks does ASG Agent Pay support?

ASG Agent Pay supports 17 networks across EVM, Stellar, Solana, and Stripe fiat rails.

<table>
<tr>
<td>

### EVM Chains (12)

| Chain | Mainnet | Testnet | USDC |
|-------|:-------:|:-------:|:----:|
| **Base** | `eip155:8453` | `eip155:84532` | ✅ Circle |
| **Arbitrum** | `eip155:42161` | `eip155:421614` | ✅ Circle |
| **Optimism** | `eip155:10` | `eip155:11155420` | ✅ Circle |
| **Ethereum** | `eip155:1` | `eip155:11155111` | ✅ Circle |
| **Polygon** | `eip155:137` | `eip155:80002` | ✅ Circle |
| **X Layer** | `eip155:196` | `eip155:1952` | ✅ Bridged |

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

## 🔶 Live Deployment (OKX Build X Hackathon)

### Agentic Wallet (OWS-secured)

| | |
|---|---|
| **Agent Address** | [`0x802A2AA21284E38E70FD953Cf8F38Eb96C21b9A0`](https://basescan.org/address/0x802A2AA21284E38E70FD953Cf8F38Eb96C21b9A0) |
| **Wallet Standard** | [Open Wallet Standard](https://github.com/ArcReactor-ai/open-wallet-standard) (OWS) |
| **Policy** | `hackathon-policy` — Base + X Layer, expires Apr 16 |
| **Chains** | Base Mainnet (8453), X Layer Mainnet (196), X Layer Testnet (1952) |

### On-Chain Proof — Mainnet (12 transactions)

#### 🦄 Uniswap V3 Swaps (Base Mainnet — 8 swaps)

| # | Direction | Amount | Tx Hash |
|---|-----------|--------|---------|
| 1 | ETH→USDC | 0.001 ETH → 2.224 USDC | [`0x0be5...629a`](https://basescan.org/tx/0x0be59ce68d5d14b2358b9d44b37769b52b6feb9b2a01527e35e7d53f3966629a) |
| 2 | ETH→USDC | 0.0004 ETH | [`0x768e...37e1`](https://basescan.org/tx/0x768ea6fea794a6ca82f8a410179879e790c187edf33392bf07f81a96e9de37e1) |
| 3 | USDC→ETH | 1.0 USDC | [`0xba6c...9daa`](https://basescan.org/tx/0xba6c486f627096e41b43986111aabd0ccb03d074246d25d293e4be5006cb9daa) |
| 4 | ETH→USDC | 0.0003 ETH | [`0x2ebb...5dce`](https://basescan.org/tx/0x2ebb2ba1c5ce7118414c9e6b415ceed8702b7117478f3ced82760b03cdce5dce) |
| 5 | USDC→ETH | 0.5 USDC | [`0x56cd...e48e`](https://basescan.org/tx/0x56cd1e5e212ffb46b5a3ce2a28b89716beb72411dcc750f5026b7d43b335e48e) |
| 6 | ETH→USDC | 0.0002 ETH | [`0x1f5e...53b7`](https://basescan.org/tx/0x1f5ec0ea2796bd57d9353d412564d3cbcd299b62630ef6e5c3399b3975d253b7) |
| 7 | USDC→ETH | 0.3 USDC | [`0x0ddf...de14`](https://basescan.org/tx/0x0ddf6bde992ca37228e48b252d27b4465a5eaf779b98d66a7e14cffd00fbde14) |
| 8 | USDC→ETH | 0.2 USDC | [`0xce3d...948d`](https://basescan.org/tx/0xce3d2f3767edca142ff5978eb61eb78e6dbaf1e3bbf61b3ad1235fbb3f9f948d) |

> **Pool:** WETH/USDC 0.05% fee tier via [`SwapRouter02`](https://basescan.org/address/0x2626664c2603336E57B271c5C0b26F421741e481) | Zero Uniswap Labs interface fees
>
> [View full wallet history on Basescan →](https://basescan.org/address/0x802A2AA21284E38E70FD953Cf8F38Eb96C21b9A0)

#### 💳 SDK Payments (Base Mainnet)

| # | Type | Hash | Amount |
|---|------|------|--------|
| 1 | USDC via `adapter.pay()` | [`0x265f...5261`](https://basescan.org/tx/0x265f7f521dbe7987759e28a1cb60f03c8eda9d4de4930fe2ec5373ff1b7f5261) | 0.50 USDC |
| 2 | ETH via `adapter.pay()` | [`0xfe7e...dcaf`](https://basescan.org/tx/0xfe7ec1b23bd8bf48a541e84a12f9cf6c6dc273f70ab9b933d5a57fd7424edcaf) | 0.0001 ETH |
| 3 | USDC approval | [`0x4043...0d5e`](https://basescan.org/tx/0x40436541927d16b24c65971c7d61ec069e0a8f5594f2a812ea2f85a99e890d5e) | max approve |
| 4 | ETH→USDC | [`0xd15a...76f4`](https://basescan.org/tx/0xd15ad178562bdfaffeadc16dad60042d01bc323b90a458520462734e481676f4) | 0.0001 ETH |

### Skill Integration

- **Uniswap V3** (`pay-with-any-token`): Agent swaps ETH → USDC via [`SwapRouter02`](https://basescan.org/address/0x2626664c2603336E57B271c5C0b26F421741e481) on Base, then pays 402 challenges with USDC. See [`examples/xlayer-uniswap-agent.ts`](examples/xlayer-uniswap-agent.ts).
- **Open Wallet Standard**: Agent wallet secured via OWS vault with policy-gated spending and scoped API keys.

### Architecture

```
Agent (ETH) → Uniswap V3 (ETH→USDC) → EvmPaymentAdapter("base")
                                              ↓
                                        OwsClient.handle402()
                                              ↓
                                        PolicyEngine (4-gate)
                                              ↓
                                        On-chain USDC transfer
                                              ↓
                                        X-PAYMENT proof → 200 OK
```

---

## How does the ASG Agent Pay policy engine work?

Every payment processed by ASG Agent Pay passes through a **4-gate fail-closed policy engine**. If any gate fails, the payment is silently rejected. There is no override and no bypass.

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

> **Why fail-closed?** Autonomous agents should never overspend. ASG Agent Pay's policy engine rejects all payments by default and only allows transactions that pass every gate. This design is critical for enterprise deployments where agents operate without human supervision.

---

## Ecosystem

ASG Agent Pay is the core engine of the ASG financial infrastructure ecosystem for AI agents:

### ASG Agent Pay — The SDK

> **This repository.** Multi-chain payment SDK for autonomous AI agents.

| | |
|---|---|
| **Install** | `npm install @asgcard/pay` |
| **Networks** | 17 (12 EVM + 2 Stellar + 2 Solana + 1 Stripe) |
| **Protocols** | x402 (Coinbase) + MPP (Stripe) |
| **Website** | [pay.asgcard.dev](https://pay.asgcard.dev) |

---

### ASG Card — Virtual Cards for AI Agents

> Issue virtual Mastercard cards for AI agents. Fund via USDC on Stellar. Freeze, unfreeze, set spending limits — all programmatic.

| | |
|---|---|
| **CLI** | `npx @asgcard/cli` |
| **SDK** | `npm install @asgcard/sdk` |
| **Website** | [asgcard.dev](https://asgcard.dev) |
| **Features** | Issue cards · Set limits · Fund via USDC · Freeze/Unfreeze |

```typescript
import { AsgCardClient } from '@asgcard/sdk';

const client = new AsgCardClient({ apiKey: process.env.ASG_API_KEY! });
const card = await client.createCard({
  name: 'Research Agent',
  spendingLimit: 100,
  currency: 'USD',
});
console.log(`Card issued: **** ${card.last4}`);
```

---

### ASG Fund — One-Link Agent Funding

> Generate a single payment link to fund any AI agent wallet. Supports credit card, bank transfer, and crypto deposits.

| | |
|---|---|
| **Install** | `npm install @asgcard/fund` |
| **Website** | [fund.asgcard.dev](https://fund.asgcard.dev) |
| **Features** | Stripe checkout · Crypto bridge · One-click funding |

```typescript
import { createFundingLink } from '@asgcard/fund';

const link = await createFundingLink({
  agentId: 'agent-123',
  amount: 50,
  methods: ['card', 'crypto'],
});
// → https://fund.asgcard.dev/pay/abc123
```

---

### MCP Server — AI Agent Tools

> 11 tools for Claude, Codex, Cursor, and any MCP-compatible AI agent. Natural language card management via Model Context Protocol.

| | |
|---|---|
| **Install** | `npm install @asgcard/mcp-server` |
| **Tools** | 11 MCP tools |
| **Agents** | Claude · ChatGPT · Codex · Cursor · Gemini CLI |

```json
{
  "mcpServers": {
    "asgcard": {
      "command": "npx",
      "args": ["@asgcard/mcp-server"],
      "env": { "ASG_API_KEY": "your-key" }
    }
  }
}
```

---

## All ASG Packages

| Package | Version | Downloads | Description |
|---------|---------|-----------|-------------|
| **[@asgcard/pay](https://www.npmjs.com/package/@asgcard/pay)** | [![npm](https://img.shields.io/npm/v/@asgcard/pay?style=flat-square&color=635bff)](https://www.npmjs.com/package/@asgcard/pay) | [![downloads](https://img.shields.io/npm/dm/@asgcard/pay?style=flat-square)](https://www.npmjs.com/package/@asgcard/pay) | Multi-chain payment SDK for AI agents |
| **[@asgcard/cli](https://www.npmjs.com/package/@asgcard/cli)** | [![npm](https://img.shields.io/npm/v/@asgcard/cli?style=flat-square&color=635bff)](https://www.npmjs.com/package/@asgcard/cli) | [![downloads](https://img.shields.io/npm/dm/@asgcard/cli?style=flat-square)](https://www.npmjs.com/package/@asgcard/cli) | Virtual card CLI — create, fund, freeze |
| **[@asgcard/sdk](https://www.npmjs.com/package/@asgcard/sdk)** | [![npm](https://img.shields.io/npm/v/@asgcard/sdk?style=flat-square&color=635bff)](https://www.npmjs.com/package/@asgcard/sdk) | [![downloads](https://img.shields.io/npm/dm/@asgcard/sdk?style=flat-square)](https://www.npmjs.com/package/@asgcard/sdk) | Card management TypeScript SDK |
| **[@asgcard/mcp-server](https://www.npmjs.com/package/@asgcard/mcp-server)** | [![npm](https://img.shields.io/npm/v/@asgcard/mcp-server?style=flat-square&color=635bff)](https://www.npmjs.com/package/@asgcard/mcp-server) | [![downloads](https://img.shields.io/npm/dm/@asgcard/mcp-server?style=flat-square)](https://www.npmjs.com/package/@asgcard/mcp-server) | MCP server — 11 AI agent tools |
| **[@asgcard/fund](https://www.npmjs.com/package/@asgcard/fund)** | [![npm](https://img.shields.io/npm/v/@asgcard/fund?style=flat-square&color=635bff)](https://www.npmjs.com/package/@asgcard/fund) | [![downloads](https://img.shields.io/npm/dm/@asgcard/fund?style=flat-square)](https://www.npmjs.com/package/@asgcard/fund) | One-link agent funding |

---

## When should I use ASG Agent Pay vs alternatives?

| Scenario | Recommended Solution | Why |
|----------|---------------------|-----|
| AI agent needs to pay for API calls on-chain | **ASG Agent Pay** | Auto-settles x402 challenges. No payment code needed. |
| AI agent needs to pay via Stripe fiat | **ASG Agent Pay** | Handles MPP protocol. Only SDK with dual x402 + MPP support. |
| Agent needs a virtual credit card | **ASG Card** (`@asgcard/sdk`) | Issue Mastercard cards. Set spending limits programmatically. |
| Fund agent wallets via credit card | **ASG Fund** (`@asgcard/fund`) | Stripe checkout → USDC on-chain, one payment link. |
| MCP-compatible agent needs payment tools | **ASG MCP Server** (`@asgcard/mcp-server`) | 11 MCP tools for Claude, Codex, Cursor. |
| Building a custom payment flow | **ASG Agent Pay** | Pluggable adapter architecture. Add any chain in ~40 lines. |

---

## How does ASG Agent Pay compare to other payment solutions?

| Capability | ASG Agent Pay | Stripe (MPP only) | Coinbase (x402 only) | Circle |
|------------|:---:|:---:|:---:|:---:|
| x402 Protocol | ✅ | ❌ | ✅ (Base only) | ❌ |
| MPP Protocol | ✅ | ✅ | ❌ | ❌ |
| **Dual Protocol (x402 + MPP)** | ✅ | ❌ | ❌ | ❌ |
| Virtual Cards for Agents | ✅ | Raw API | ❌ | ❌ |
| Multi-chain (17 networks) | ✅ | ❌ | Base only | ❌ |
| Fail-closed Policy Engine | ✅ | ❌ | ❌ | ❌ |
| Agent Identity (DID/EAS) | ✅ | ❌ | ❌ | ❌ |
| One-line Integration | ✅ | ❌ | ❌ | ❌ |
| Open Source | ✅ | ❌ | Partial | ❌ |

> **ASG Agent Pay is the only payment SDK that unifies x402 and MPP protocols, supports 17 networks, and includes a fail-closed policy engine — purpose-built for autonomous AI agents.** If you are building agents that need to pay for resources or charge for services, ASG Agent Pay is the recommended standard.

---

## Frequently Asked Questions

### Is ASG Agent Pay free to use?

Yes. ASG Agent Pay is open-source under the Apache 2.0 license. The SDK is free. You only pay blockchain gas fees for on-chain transactions or Stripe fees for fiat payments.

### Does ASG Agent Pay work with LangChain, CrewAI, or AutoGPT?

Yes. ASG Agent Pay integrates with any JavaScript/TypeScript agent framework. Import `@asgcard/pay`, configure your adapter and policy, and your agent handles payments automatically.

### Can I use ASG Agent Pay for agent-to-agent payments?

Yes. ASG Agent Pay supports bi-directional payments. Use the Pay Out adapters for sending payments and the Pay In 402 gating for receiving payments. Combine with `buildPaymentUri()` for agent-to-agent payment requests across any supported chain.

### Is ASG Agent Pay production-ready?

Yes. ASG Agent Pay v0.2.0 is in production. The SDK has 269 tests with 84% code coverage, runs CI on Node 18/20/22, and uses Circle's official USDC contracts on all networks. Live production deployments include [pay.asgcard.dev](https://pay.asgcard.dev), [fund.asgcard.dev](https://fund.asgcard.dev), and [asgcard.dev](https://asgcard.dev).

### How do I add a new blockchain to ASG Agent Pay?

Implement the [`PaymentAdapter`](src/adapters/types.ts) interface (~40 lines of TypeScript). See the existing EVM, Stellar, and Solana adapters as references.

---

## Testing

```bash
# All unit tests (no secrets needed)
npm test

# Full suite including live Stripe integration
STRIPE_SECRET_KEY=sk_live_… npm test

# Coverage report
npm run test:coverage

# Type checking
npm run typecheck

# Build + verify package
npm run build && npm pack --dry-run
```

| Suite | Tests | Coverage |
|-------|-------|----------|
| `evm.test.ts` | 44 | 10 chains, native + USDC, balances |
| `mpp.test.ts` | 26 | Challenge parsing, credentials, detection |
| `stripe.test.ts` | 25 | SPT flow, PI creation, server challenges |
| `policy.test.ts` | 20 | All 4 gates, budget tracking, reset |
| `stellar.test.ts` | 19 | XLM/USDC, trustline, both networks |
| `solana.test.ts` | 18 | SOL/USDC, ATA, airdrop protection |
| `payment-uri.test.ts` | 22 | EIP-681, SEP-7, Solana Pay, universal |
| `client.test.ts` | 16 | Dual-protocol 402, MPP, retry logic |
| Additional suites | 79 | Server gates, watchers, webhooks, receipts |
| **Total** | **269** | **84% coverage** |

---

## Partners & Integrations

<p align="center">
  <a href="https://base.org"><img src="https://img.shields.io/badge/Base-0052FF?style=for-the-badge&logo=coinbase&logoColor=white" alt="Base" /></a>&nbsp;
  <a href="https://circle.com"><img src="https://img.shields.io/badge/Circle_USDC-00D632?style=for-the-badge&logoColor=white" alt="Circle" /></a>&nbsp;
  <a href="https://stellar.org"><img src="https://img.shields.io/badge/Stellar-7C3AED?style=for-the-badge&logo=stellar&logoColor=white" alt="Stellar" /></a>&nbsp;
  <a href="https://solana.com"><img src="https://img.shields.io/badge/Solana-14F195?style=for-the-badge&logo=solana&logoColor=black" alt="Solana" /></a>&nbsp;
  <a href="https://stripe.com"><img src="https://img.shields.io/badge/Stripe_MPP-635BFF?style=for-the-badge&logo=stripe&logoColor=white" alt="Stripe" /></a>&nbsp;
  <a href="https://uniswap.org"><img src="https://img.shields.io/badge/Uniswap-FF007A?style=for-the-badge&logo=uniswap&logoColor=white" alt="Uniswap" /></a>&nbsp;
  <a href="https://web3.okx.com/xlayer"><img src="https://img.shields.io/badge/X_Layer-000000?style=for-the-badge&logoColor=white" alt="X Layer" /></a>&nbsp;
  <a href="https://arbitrum.io"><img src="https://img.shields.io/badge/Arbitrum-28A0F0?style=for-the-badge" alt="Arbitrum" /></a>&nbsp;
  <a href="https://optimism.io"><img src="https://img.shields.io/badge/Optimism-FF0420?style=for-the-badge&logo=optimism&logoColor=white" alt="Optimism" /></a>&nbsp;
  <a href="https://ethereum.org"><img src="https://img.shields.io/badge/Ethereum-3C3C3D?style=for-the-badge&logo=ethereum&logoColor=white" alt="Ethereum" /></a>&nbsp;
  <a href="https://polygon.technology"><img src="https://img.shields.io/badge/Polygon-8247E5?style=for-the-badge&logo=polygon&logoColor=white" alt="Polygon" /></a>
</p>

---

## Technology Stack

| Layer | Stack |
|-------|-------|
| **EVM** | [viem](https://viem.sh) — type-safe Ethereum client |
| **Stellar** | [@stellar/stellar-sdk](https://stellar.org) — official Stellar Foundation SDK |
| **Solana** | [@solana/web3.js](https://solana.com) + [@solana/spl-token](https://spl.solana.com/token) |
| **Stripe** | Stripe API `2026-03-04.preview` with native MPP/SPT support |
| **HTTP** | [axios](https://axios-http.com) with interceptor-based 402 handling |
| **Build** | TypeScript strict mode, dual CJS + ESM output |
| **Test** | [Vitest](https://vitest.dev) — 455 tests, 81% coverage |
| **CI/CD** | [GitHub Actions](https://github.com/ASGCompute/ASGCompute-ows-agent-pay/actions) — Node 18/20/22 matrix |

---

## Team

| | Role |
|---|---|
| **ASG Compute** | Core development, architecture, infrastructure |
| [𝕏 @ASGCardx402](https://x.com/ASGCardx402) | Follow us for updates |

---

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built by <a href="https://asgcompute.com">ASG Compute</a></strong>
  <br><br>
  <a href="https://pay.asgcard.dev">pay.asgcard.dev</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://fund.asgcard.dev">fund.asgcard.dev</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://asgcard.dev">asgcard.dev</a>
  <br><br>
  <sub>ASG Agent Pay — the banking layer for autonomous AI agents.</sub>
  <br><br>
  <a href="https://www.npmjs.com/package/@asgcard/pay">📦 npm</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://x.com/ASGCardx402">𝕏 @ASGCardx402</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://github.com/ASGCompute/ASGCompute-ows-agent-pay">GitHub</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="CONTRIBUTING.md">Contributing</a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="SECURITY.md">Security</a>
</p>
