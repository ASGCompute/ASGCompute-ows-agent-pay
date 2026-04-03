/* ═══════════════════════════════════════════════
   ASG Pay Ecosystem — Interactive Demo Engine
   ═══════════════════════════════════════════════ */

const ECOSYSTEM = {
  /* ─── Simulated Fund Flow ─── */
  fund: {
    steps: [
      { delay: 400, line: `<span class="tag tag-agent">[Agent]</span> <span class="dim">Generating payment link...</span>` },
      { delay: 600, line: `<span class="tag tag-agent">[Agent]</span> 🔗 <span class="highlight">https://fund.asgcard.dev/?agentName=TradeBot&toAmount=50&toToken=USDC</span>` },
      { delay: 800, line: `<span class="tag tag-agent">[Agent]</span> 📤 Payment link sent to user` },
      { delay: 1200, line: `<span class="tag tag-api">[ASG Pay]</span> 👤 User opened checkout page` },
      { delay: 600, line: `<span class="tag tag-api">[ASG Pay]</span> 💳 Payment method: <span class="highlight">Visa •••• 4242</span>` },
      { delay: 800, line: `<span class="tag tag-api">[ASG Pay]</span> 🔄 Processing via Stripe...` },
      { delay: 1500, line: `<span class="tag tag-api">[Stripe]</span> ✅ Charge $50.00 — <span class="dim">ch_3QxKa2...</span>` },
      { delay: 600, line: `<span class="tag tag-api">[Settlement]</span> 🚀 Converting USD → USDC on Stellar...` },
      { delay: 1000, line: `<span class="tag tag-base">[Stellar]</span> ✅ 50.00 USDC sent to <span class="highlight">GDQP2K...YSHWM</span>` },
      { delay: 400, line: `<span class="tag tag-base">[Stellar]</span> 📡 Tx: <span class="dim">b4f7e8a9c6d5...</span>` },
      { delay: 600, line: `<span class="tag tag-agent">[Agent]</span> <span class="success">💰 Balance updated: 50.00 USDC</span>` },
      { delay: 400, line: `\n<span class="success">── ✅ Agent funded successfully ──────────────</span>` },
    ]
  },

  /* ─── Simulated Card Flow ─── */
  card: {
    steps: [
      { delay: 400, line: `<span class="tag tag-agent">[Agent]</span> <span class="dim">Need to purchase SerpAPI credit ($15)...</span>` },
      { delay: 600, line: `<span class="tag tag-agent">[Agent]</span> 🔧 Calling <span class="highlight">@asgcard/sdk</span> → createCard()` },
      { delay: 800, line: `<span class="tag tag-ows">[ASG Card]</span> ⚡ Provisioning virtual Mastercard...` },
      { delay: 500, line: `<span class="tag tag-ows">[ASG Card]</span>   Spend limit: <span class="highlight">$15.00</span>` },
      { delay: 300, line: `<span class="tag tag-ows">[ASG Card]</span>   Auto-destroy: <span class="highlight">after 1 transaction</span>` },
      { delay: 400, line: `<span class="tag tag-ows">[ASG Card]</span>   Currency: <span class="highlight">USD</span>` },
      { delay: 1200, line: `<span class="tag tag-api">[Stripe Issuing]</span> ✅ Card created — <span class="highlight">ic_1QxK...</span>` },
      { delay: 600, line: `<span class="tag tag-ows">[ASG Card]</span> 💳 Card details:` },
      { delay: 300, line: `<span class="dim">  ┌────────────────────────────────────┐</span>` },
      { delay: 200, line: `<span class="dim">  │</span> Number:  <span class="highlight">5425 2334 •••• 7891</span><span class="dim">      │</span>` },
      { delay: 200, line: `<span class="dim">  │</span> Expiry:  <span class="highlight">12/26</span>    CVC: <span class="highlight">•••</span><span class="dim">       │</span>` },
      { delay: 200, line: `<span class="dim">  │</span> Holder:  <span class="highlight">TRADE BOT AGENT</span><span class="dim">          │</span>` },
      { delay: 200, line: `<span class="dim">  └────────────────────────────────────┘</span>` },
      { delay: 800, line: `<span class="tag tag-agent">[Agent]</span> 🛒 Using card to purchase SerpAPI credit...` },
      { delay: 1200, line: `<span class="tag tag-api">[Stripe Issuing]</span> ✅ Authorization: $15.00 at <span class="highlight">serpapi.com</span>` },
      { delay: 600, line: `<span class="tag tag-ows">[ASG Card]</span> 🔥 Card auto-destroyed (single-use policy)` },
      { delay: 400, line: `\n<span class="success">── ✅ Agent purchased API credit autonomously ─</span>` },
    ]
  },

  /* ─── Simulated x402 Pay Flow ─── */
  pay: {
    steps: [
      { delay: 400, line: `<span class="tag tag-agent">[Agent]</span> 🧠 Sending inference request...` },
      { delay: 500, line: `<span class="tag tag-agent">[Agent]</span> → POST <span class="highlight">/api/inference</span> { model: "gpt-4o" }` },
      { delay: 800, line: `<span class="tag tag-ows">[OWS Client]</span> ⚡ Received <span class="warn">402 Payment Required</span>` },
      { delay: 400, line: `<span class="tag tag-ows">[OWS Client]</span>   x402Version: <span class="highlight">2</span>` },
      { delay: 300, line: `<span class="tag tag-ows">[OWS Client]</span>   Amount: <span class="highlight">$0.50</span>` },
      { delay: 300, line: `<span class="tag tag-ows">[OWS Client]</span>   Chain: <span class="highlight">Base Sepolia (eip155:84532)</span>` },
      { delay: 300, line: `<span class="tag tag-ows">[OWS Client]</span>   PayTo: <span class="dim">0xDead7101...</span>` },
      { delay: 600, line: `<span class="tag tag-policy">[Policy]</span> 🔍 Evaluating payment policy...` },
      { delay: 400, line: `<span class="tag tag-policy">[Policy]</span>   ✅ Budget check: $0.50 / $10.00` },
      { delay: 300, line: `<span class="tag tag-policy">[Policy]</span>   ✅ Per-tx limit: $0.50 ≤ $1.00` },
      { delay: 300, line: `<span class="tag tag-policy">[Policy]</span>   ✅ Destination: whitelisted` },
      { delay: 400, line: `<span class="tag tag-policy">[Policy]</span> 📊 Spent $0.50 — total: $0.50/$10.00` },
      { delay: 800, line: `<span class="tag tag-base">[Base]</span> 🚀 Building payment → <span class="dim">0xDead71...</span> (0.0005 ETH)` },
      { delay: 500, line: `<span class="tag tag-base">[Base]</span> 📡 Submitting to Base Sepolia...` },
      { delay: 1200, line: `<span class="tag tag-base">[Base]</span> <span class="success">✅ Confirmed</span> — hash: <span class="dim">0x9e8f7a6b5c...</span>` },
      { delay: 600, line: `<span class="tag tag-ows">[OWS Client]</span> 📎 Constructing X-PAYMENT token...` },
      { delay: 400, line: `<span class="dim">  ┌─ X-PAYMENT Token ──────────────────────┐</span>` },
      { delay: 200, line: `<span class="dim">  │</span> <span class="highlight">eyJ4NDAyVmVyc2lvbiI6Minw...</span><span class="dim"> │</span>` },
      { delay: 200, line: `<span class="dim">  └──────────────────────────────────────────┘</span>` },
      { delay: 500, line: `<span class="tag tag-ows">[OWS Client]</span> 🔁 Retrying POST /api/inference with proof` },
      { delay: 800, line: `<span class="tag tag-api">[API]</span> <span class="success">✅ Received X-PAYMENT proof</span>` },
      { delay: 300, line: `<span class="tag tag-api">[API]</span>   chain: <span class="highlight">eip155:84532</span>` },
      { delay: 300, line: `<span class="tag tag-api">[API]</span>   tx: <span class="dim">0x9e8f7a6b5c...</span>` },
      { delay: 600, line: `<span class="tag tag-agent">[Agent]</span> <span class="success">✅ Task completed: The AI model computed the answer to life, the universe, and everything: 42.</span>` },
      { delay: 400, line: `\n<span class="success">── 🏁 x402 Payment flow complete ────────────</span>` },
    ]
  }
};

/* ─── State ─── */
let activeTab = 'fund';
let isRunning = false;
let currentAbort = null;

/* ─── Tab Switching ─── */
function switchTab(tab) {
  if (isRunning) return;
  activeTab = tab;

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  document.querySelectorAll('.lifecycle-step[data-tab]').forEach(s => s.classList.toggle('active', s.dataset.tab === tab));
}

/* ─── Terminal Runner ─── */
async function runDemo(tab) {
  if (isRunning) return;
  isRunning = true;

  const termBody = document.getElementById(`terminal-${tab}`);
  const btn = document.getElementById(`btn-${tab}`);
  const progress = document.getElementById(`progress-${tab}`);

  if (!termBody || !btn) return;

  termBody.innerHTML = '';
  btn.disabled = true;
  btn.textContent = '⏳ Running...';
  if (progress) progress.style.width = '0%';

  const steps = ECOSYSTEM[tab].steps;
  const controller = new AbortController();
  currentAbort = controller;

  for (let i = 0; i < steps.length; i++) {
    if (controller.signal.aborted) break;

    await sleep(steps[i].delay);

    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.innerHTML = steps[i].line;
    termBody.appendChild(line);
    termBody.scrollTop = termBody.scrollHeight;

    if (progress) {
      progress.style.width = `${((i + 1) / steps.length) * 100}%`;
    }
  }

  // Show result card
  const resultEl = document.getElementById(`result-${tab}`);
  if (resultEl) {
    resultEl.style.display = 'block';
    resultEl.style.animation = 'fadeIn 0.5s ease';
  }

  // Update lifecycle step
  const lifecycleStep = document.querySelector(`.lifecycle-step[data-tab="${tab}"]`);
  if (lifecycleStep) {
    lifecycleStep.style.borderColor = 'var(--accent-green)';
    lifecycleStep.style.boxShadow = '0 0 20px rgba(34, 197, 94, 0.2)';
  }

  btn.disabled = false;
  btn.textContent = '↻ Run Again';
  isRunning = false;
  currentAbort = null;
}

/* ─── Fund Tab: Payment Method Selection ─── */
function selectPaymentMethod(el) {
  document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('selected'));
  el.classList.add('selected');
}

/* ─── Card Tab: Animate Card Reveal ─── */
function revealCard() {
  const card = document.getElementById('virtual-card-display');
  if (card) {
    card.style.opacity = '1';
    card.style.transform = 'perspective(800px) rotateY(0deg)';
  }
}

/* ─── Helpers ─── */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', () => {
  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Lifecycle clicks
  document.querySelectorAll('.lifecycle-step[data-tab]').forEach(step => {
    step.addEventListener('click', () => switchTab(step.dataset.tab));
  });

  // Demo buttons
  document.querySelectorAll('[data-run]').forEach(btn => {
    btn.addEventListener('click', () => runDemo(btn.dataset.run));
  });

  // Payment method selection
  document.querySelectorAll('.payment-method').forEach(m => {
    m.addEventListener('click', () => selectPaymentMethod(m));
  });

  // Set initial active tab
  switchTab('fund');
});
