/**
 * OWS Agent Pay — Interactive x402 Demo Engine
 * 
 * Simulates the full payment flow in the browser for hackathon judges.
 * No backend needed — everything runs client-side.
 */

// ─── Utilities ───────────────────────────────────────────────────────
function randomHex(length) {
  return Array.from({ length }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

function randomAddress() {
  return '0x' + randomHex(40);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Terminal Engine ─────────────────────────────────────────────────
const terminal = document.getElementById('terminal');
let lineIndex = 0;

function clearTerminal() {
  terminal.innerHTML = '';
  lineIndex = 0;
}

function addLine(text, className = '') {
  const line = document.createElement('div');
  line.className = `terminal-line ${className}`;
  line.textContent = text;
  line.style.animationDelay = `${lineIndex * 0.05}s`;
  terminal.appendChild(line);
  lineIndex++;
  terminal.scrollTop = terminal.scrollHeight;
  return line;
}

function addEmptyLine() {
  addLine('');
}

// ─── Flow Step Highlights ────────────────────────────────────────────
const flowSteps = {
  agent: document.getElementById('step-agent'),
  api: document.getElementById('step-api'),
  policy: document.getElementById('step-policy'),
  settle: document.getElementById('step-settle'),
  proof: document.getElementById('step-proof'),
};

function resetFlowSteps() {
  Object.values(flowSteps).forEach(el => {
    el.classList.remove('active', 'done');
  });
}

function activateStep(stepId) {
  Object.entries(flowSteps).forEach(([id, el]) => {
    if (id === stepId) {
      el.classList.add('active');
      el.classList.remove('done');
    }
  });
}

function completeStep(stepId) {
  if (flowSteps[stepId]) {
    flowSteps[stepId].classList.remove('active');
    flowSteps[stepId].classList.add('done');
  }
}

// ─── Stats Panel ─────────────────────────────────────────────────────
const stats = {
  status: document.getElementById('statStatus'),
  chain: document.getElementById('statChain'),
  payment: document.getElementById('statPayment'),
  budget: document.getElementById('statBudget'),
  txHash: document.getElementById('statTxHash'),
  time: document.getElementById('statTime'),
};

function updateStat(key, value) {
  if (stats[key]) stats[key].textContent = value;
}

// ─── Main Demo Flow ──────────────────────────────────────────────────
async function runDemo() {
  const startTime = performance.now();

  // Read config
  const budget = parseFloat(document.getElementById('cfgBudget').value) || 10;
  const maxTx = parseFloat(document.getElementById('cfgMaxTx').value) || 1;
  const chain = document.getElementById('cfgChain').value;

  const chainNames = {
    'base-sepolia': 'Base Sepolia',
    'base': 'Base Mainnet',
    'stellar-testnet': 'Stellar Testnet',
  };
  const caipIds = {
    'base-sepolia': 'eip155:84532',
    'base': 'eip155:8453',
    'stellar-testnet': 'stellar:testnet',
  };

  const chainName = chainNames[chain] || chain;
  const caipId = caipIds[chain] || chain;
  const agentAddress = randomAddress();
  const treasuryAddress = randomAddress();
  const paymentAmount = 0.50;

  // Reset UI
  clearTerminal();
  resetFlowSteps();
  document.getElementById('statsPanel').classList.add('visible');

  updateStat('status', '🔄 Running…');
  updateStat('chain', `${chainName}`);
  updateStat('payment', '—');
  updateStat('budget', `$0 / $${budget}`);
  updateStat('txHash', '—');
  updateStat('time', '—');

  // Disable button
  const startBtn = document.getElementById('startDemo');
  startBtn.disabled = true;
  startBtn.textContent = '⏳ Running…';
  startBtn.classList.remove('pulse');

  // ── Banner ──
  addLine('╔══════════════════════════════════════════════════════╗', 'cyan');
  addLine('║   OWS Agent Pay — Base/EVM Autonomous Demo          ║', 'cyan');
  addLine('║   Built by ASG Pay  •  https://asgcard.dev           ║', 'cyan');
  addLine('║   x402 Protocol  •  ' + chainName.padEnd(33) + '║', 'cyan');
  addLine('╚══════════════════════════════════════════════════════╝', 'cyan');
  addEmptyLine();

  await sleep(500);

  // ── Server ──
  addLine('[Server] Mock x402 API started', 'white');
  addLine(`[Server] Treasury: ${treasuryAddress}`, 'dim');
  addEmptyLine();
  addLine('── 🤖 AI Agent Workflow ────────────────────────────', 'header');
  addEmptyLine();

  await sleep(400);

  // ── Agent Setup ──
  activateStep('agent');
  addLine(`[Agent] Wallet:  ${agentAddress}`, 'white');
  addLine(`[Agent] Chain:   ${chainName} (${caipId})`, 'white');
  addLine(`[Agent] Policy:  $${budget}/mo max, $${maxTx}/tx limit`, 'white');
  addLine('[Agent] 💰 Balance: 0.1 ETH (funded)', 'green');

  await sleep(600);

  addEmptyLine();
  addLine('[Agent] 🧠 Sending inference request…', 'yellow');
  addEmptyLine();
  completeStep('agent');

  await sleep(500);

  // ── Request to API ──
  activateStep('api');
  addLine('[AI Agent] 🧠 Sending task to /api/inference', 'white');
  addLine('  → POST /api/inference', 'dim');
  addLine('  → {"model": "gpt-4", "messages": [...]}', 'dim');

  await sleep(700);

  // ── 402 Response ──
  addLine('[OWS Client] ⚡ Received 402 Payment Required challenge', 'yellow');
  updateStat('status', '⚡ 402 Received');

  await sleep(300);

  addLine(`[OWS Client] 💰 Requested payment: $${paymentAmount}`, 'yellow');
  addLine(`[OWS Client] ⛓️  Settlement chain: ${chainName} (${caipId})`, 'cyan');
  updateStat('payment', `$${paymentAmount}`);

  await sleep(400);

  // Show 402 payload
  addLine('  ┌─ x402 Challenge ──────────────────┐', 'dim');
  addLine('  │ x402Version: 2                     │', 'dim');
  addLine(`  │ network:     ${chain.padEnd(22)}│`, 'dim');
  addLine(`  │ amount:      500000000000000 wei    │`, 'dim');
  addLine(`  │ payTo:       ${treasuryAddress.slice(0, 22)}… │`, 'dim');
  addLine('  │ asset:       ETH                    │', 'dim');
  addLine('  └────────────────────────────────────┘', 'dim');
  addEmptyLine();
  completeStep('api');

  await sleep(500);

  // ── Policy Check ──
  activateStep('policy');
  addLine('[Policy] ── Evaluating spend request ──', 'white');

  await sleep(300);

  // Budget check
  if (paymentAmount > maxTx) {
    addLine(`[Policy] 🛑 REJECTED: $${paymentAmount} > max $${maxTx}/tx`, 'red');
    updateStat('status', '🛑 Policy Rejected');
    finishDemo(startTime, startBtn);
    return;
  }
  addLine(`[Policy] ✓ Per-tx limit:    $${paymentAmount} ≤ $${maxTx}`, 'green');

  await sleep(200);

  if (paymentAmount > budget) {
    addLine(`[Policy] 🛑 REJECTED: $${paymentAmount} > budget $${budget}`, 'red');
    updateStat('status', '🛑 Policy Rejected');
    finishDemo(startTime, startBtn);
    return;
  }
  addLine(`[Policy] ✓ Monthly budget:  $${paymentAmount} ≤ $${budget}`, 'green');

  await sleep(200);

  addLine(`[Policy] ✓ Destination:     ${treasuryAddress.slice(0, 14)}… ∈ allowlist`, 'green');

  await sleep(300);

  addLine('[OWS Client] ✅ Policy check PASSED — settling on-chain…', 'green');
  addEmptyLine();
  updateStat('status', '✅ Policy Passed');
  completeStep('policy');

  await sleep(500);

  // ── On-chain Settlement ──
  activateStep('settle');
  const ethAmount = '0.000500';
  addLine(`[${chainName.includes('Stellar') ? 'Stellar' : 'Base'}] 🚀 Building payment → ${treasuryAddress.slice(0, 8)}…${treasuryAddress.slice(-6)} (${ethAmount} ETH)`, 'cyan');

  await sleep(400);

  addLine(`[${chainName.includes('Stellar') ? 'Stellar' : 'Base'}] 📡 Submitting transaction…`, 'yellow');
  updateStat('status', '📡 Settling…');

  await sleep(1200);

  const txHash = '0x' + randomHex(64);
  addLine(`[${chainName.includes('Stellar') ? 'Stellar' : 'Base'}] ✅ Confirmed — hash: ${txHash.slice(0, 24)}…`, 'green');

  const explorerUrl = chain === 'stellar-testnet'
    ? `https://stellar.expert/explorer/testnet/tx/${txHash}`
    : chain === 'base'
    ? `https://basescan.org/tx/${txHash}`
    : `https://sepolia.basescan.org/tx/${txHash}`;
  addLine(`[${chainName.includes('Stellar') ? 'Stellar' : 'Base'}] 🔗 ${explorerUrl}`, 'dim');

  updateStat('txHash', txHash.slice(0, 18) + '…');
  updateStat('budget', `$${paymentAmount} / $${budget}`);
  addLine(`[Policy] 📊 Spent $${paymentAmount} — total: $${paymentAmount}/$${budget}`, 'white');
  completeStep('settle');
  addEmptyLine();

  await sleep(500);

  // ── X-PAYMENT Proof ──
  activateStep('proof');
  addLine('[OWS Client] 🔁 Constructing X-PAYMENT token and retrying…', 'cyan');

  await sleep(300);

  // Build actual base64 proof
  const proofPayload = {
    x402Version: 2,
    accepted: {
      scheme: 'exact',
      network: chain,
      amount: '500000000000000',
      payTo: treasuryAddress,
      asset: 'ETH',
    },
    payload: {
      transaction: txHash,
      chain: caipId,
    },
  };
  const base64Token = btoa(JSON.stringify(proofPayload));

  addLine('  ┌─ X-PAYMENT Token ─────────────────┐', 'dim');
  addLine(`  │ ${base64Token.slice(0, 38)}… │`, 'dim');
  addLine('  └────────────────────────────────────┘', 'dim');

  await sleep(300);

  addLine('  → Retrying POST /api/inference', 'dim');
  addLine(`  → X-PAYMENT: ${base64Token.slice(0, 30)}…`, 'dim');

  await sleep(600);

  // ── Verify proof server-side ──
  addLine('[API] ✅ Received X-PAYMENT proof:', 'green');
  addLine(`[API]    x402Version: ${proofPayload.x402Version}`, 'white');
  addLine(`[API]    chain:       ${caipId}`, 'white');
  addLine(`[API]    tx:          ${txHash.slice(0, 20)}…`, 'white');
  addLine(`[API]    payTo:       ${treasuryAddress.slice(0, 14)}…`, 'white');

  await sleep(400);

  addLine('[AI Agent] ✅ Task completed: The AI model computed the answer to life, the universe, and everything: 42.', 'green');
  addEmptyLine();

  addLine('[Agent] 🎉 Result received:', 'green bold');
  addLine(JSON.stringify({
    status: 'success',
    message: 'The AI model computed the answer to life, the universe, and everything: 42.',
    chain: chain,
    settlement: txHash.slice(0, 20) + '…',
  }, null, 2), 'cyan');
  addEmptyLine();

  completeStep('proof');

  // ── Finish ──
  addLine('── 🏁 Demo complete ─────────────────────────────────', 'header');
  updateStat('status', '🎉 Success');

  finishDemo(startTime, startBtn);
}

function finishDemo(startTime, startBtn) {
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
  updateStat('time', `${elapsed}s`);

  startBtn.disabled = false;
  startBtn.innerHTML = '<span class="btn-icon">▶</span> Run Again';
  startBtn.classList.add('pulse');
}

// ─── Copy Code ───────────────────────────────────────────────────────
function copyCode() {
  const code = document.getElementById('installCode').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
  });
}

// ─── Event Listeners ─────────────────────────────────────────────────
document.getElementById('startDemo').addEventListener('click', () => {
  document.getElementById('demoSection').scrollIntoView({ behavior: 'smooth' });
  setTimeout(runDemo, 500);
});

document.getElementById('rerunBtn').addEventListener('click', runDemo);

// Smooth scroll to demo section on page load if hash
if (window.location.hash === '#demo') {
  setTimeout(() => {
    document.getElementById('demoSection').scrollIntoView({ behavior: 'smooth' });
  }, 500);
}
