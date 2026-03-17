const runBtn = document.getElementById("runBtn");
const statusEl = document.getElementById("status");
const jsonEl = document.getElementById("json");
const summaryEl = document.getElementById("summary");

function setStatus(s) {
  statusEl.textContent = s;
}

function renderSummary(r) {
  const lines = [];
  lines.push(`Inputs: 1 ETH quote, 20 ETH split/multihop (from backend code)`);
  lines.push("");
  lines.push(`Multi-hop (${r.multiHop.path}): ${r.multiHop.outputUsdc} USDC`);
  lines.push("");
  lines.push(`Direct (1 ETH -> USDC):`);
  lines.push(`- Uniswap:  ${r.directQuotes.uniswap_outUsdc_for1Eth} USDC`);
  lines.push(`- Sushiswap:${r.directQuotes.sushiswap_outUsdc_for1Eth} USDC`);
  lines.push("");
  lines.push(`Split best (20 ETH total):`);
  lines.push(`- Uniswap input:  ${r.bestSplit.uniswapInputEth} ETH`);
  lines.push(`- Sushiswap input:${r.bestSplit.sushiswapInputEth} ETH`);
  lines.push(`- Total output:   ${r.bestSplit.totalOutputUsdc} USDC`);
  lines.push("");
  lines.push(`Uniswap slippage (for 1 ETH quote): ${Number(r.execution.slippage_uniswap_percent_for1Eth).toFixed(6)}%`);
  return lines.join("\n");
}

async function run() {
  runBtn.disabled = true;
  setStatus("Running…");
  jsonEl.classList.remove("muted");
  summaryEl.classList.remove("muted");

  try {
    const res = await fetch("/api/amm");
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Unknown error");
    jsonEl.textContent = JSON.stringify(data.result, null, 2);
    summaryEl.textContent = renderSummary(data.result);
    setStatus("Done");
  } catch (e) {
    setStatus("Error");
    summaryEl.textContent = String(e?.message ?? e);
    jsonEl.textContent = String(e?.stack ?? e);
  } finally {
    runBtn.disabled = false;
  }
}

runBtn.addEventListener("click", run);

