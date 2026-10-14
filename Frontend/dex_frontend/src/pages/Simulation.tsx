import { useState, useEffect } from "react";
import axios from "axios";
import { useAccount } from "wagmi";
import { useTradeExecutor } from "../useTradeExecutor";
import type { ExecutionPlan } from "../execution";

const EXECUTABLE_ACTIONS = ["SINGLE_SWAP", "MULTI_HOP_SWAP"];
const TOKEN_LABELS: Record<string, string> = {
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
  "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI",
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt(parent: JsonRecord | null | undefined, key: string): JsonRecord | null {
  const value = parent?.[key];
  return isRecord(value) ? value : null;
}

function textAt(parent: JsonRecord | null | undefined, key: string): string | null {
  const value = parent?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberAt(parent: JsonRecord | null | undefined, key: string): number | null {
  const value = parent?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatNumber(value: number | null, options: Intl.NumberFormatOptions = {}) {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
    ...options,
  }).format(value);
}

function formatUsd(value: number | null) {
  if (value === null) return "Unavailable";
  return `$${formatNumber(value, { maximumFractionDigits: value >= 100 ? 2 : 6 })}`;
}

function formatPercent(value: number | null) {
  if (value === null) return "Unavailable";
  return `${formatNumber(value, { maximumFractionDigits: 4 })}%`;
}

function compactAddress(value: string | null) {
  if (!value) return "Unknown";
  const label = TOKEN_LABELS[value.toLowerCase()];
  if (label) return label;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function labelFromKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function actionLabel(value: string | null) {
  if (!value) return "No plan yet";
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function Simulation() {
  const [oneEth, setOneEth] = useState("");
  const [simulatedEth, setSimulatedEth] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const trade = useTradeExecutor();
  const { chain, isConnected } = useAccount();
  const execution = data?.execution as ExecutionPlan | undefined;
  const canExecute = !!execution && EXECUTABLE_ACTIONS.includes(execution.action);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";
    axios.get(`${baseUrl}/api/health`).catch(() => { });
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const baseUrl = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";
      const res = await axios.post(`${baseUrl}/api/amm`, { oneEth });

      if (!res.data) {
        throw new Error("No data returned from API");
      }

      setData(res.data);
      setSimulatedEth(oneEth);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Request failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const runSimulation = () => {
    setLoading(true);
    setError(null);
    setData(null);
    trade.reset();
    void fetchData();
  };

  const ammLogs = isRecord(data?.ammLogs) ? data.ammLogs : null;
  const poolLogs = isRecord(data?.poolLogs) ? data.poolLogs : null;
  const strategy = isRecord(data?.strategy) ? data.strategy : null;
  const uniswap = recordAt(ammLogs, "uniswap");
  const sushiswap = recordAt(ammLogs, "sushiswap");
  const birdeye = recordAt(ammLogs, "birdeye");
  const priceValidation = recordAt(birdeye, "priceValidation");
  const deviation = recordAt(priceValidation, "deviationPercent");
  const poolPrices = recordAt(priceValidation, "poolPriceUsd");
  const riskFlags = Array.isArray(ammLogs?.riskFlags)
    ? ammLogs.riskFlags.filter((flag): flag is string => typeof flag === "string")
    : [];
  const dexRows = [
    { id: "uniswap", label: "Uniswap", tone: "aqua", values: uniswap },
    { id: "sushiswap", label: "SushiSwap", tone: "violet", values: sushiswap },
  ].map((dex) => ({
    ...dex,
    usdcOut: numberAt(dex.values, "usdcOut"),
    effectiveOutput: numberAt(dex.values, "effectiveOutput"),
    slippage: numberAt(dex.values, "slippage"),
    executionPrice: numberAt(dex.values, "executionPrice"),
    gasCost: numberAt(dex.values, "gas_cost_usdc"),
    gasLimit: textAt(dex.values, "gasLimit"),
    inputEth: textAt(dex.values, "optimizedInputEth"),
  }));
  const bestDex =
    dexRows
      .filter((dex) => dex.effectiveOutput !== null)
      .sort((a, b) => (b.effectiveOutput ?? 0) - (a.effectiveOutput ?? 0))[0]?.label ?? "Pending";
  const maxOutput = Math.max(...dexRows.map((dex) => dex.usdcOut ?? 0), numberAt(ammLogs, "multiHopOutput") ?? 0);
  const poolEntries = poolLogs
    ? Object.entries(poolLogs)
        .filter(([, value]) => isRecord(value))
        .map(([key, value]) => ({
          key,
          pool: value as JsonRecord,
        }))
    : [];
  const executionSteps = Array.isArray(execution?.steps) ? execution.steps : [];

  return (
    <section className="simulation-page" aria-labelledby="sim-title">
      <div className="panel-header hero-panel">
        <div>
          <p className="eyebrow">Intent AMM console</p>
          <h1 id="sim-title" className="panel-title">
            Pool simulation
          </h1>
        </div>
        <span className="status-chip">{data ? "Response ready" : loading ? "Scanning pools" : "Ready"}</span>
      </div>

      <p className="panel-desc">
        Enter an ETH amount and send a POST request to <code>/api/amm </code>to simulate a swap.
        The response shows real-time pool data, estimated output (USDC), slippage, and the agent's execution plan before signing.
      </p>

      <div className="control-panel">
        <div className="input-row">
          <div className="field">
            <label htmlFor="eth-amount">ETH amount</label>
            <input
              id="eth-amount"
              type="text"
              inputMode="decimal"
              value={oneEth}
              onChange={(e) => setOneEth(e.target.value)}
              placeholder="e.g. 1 or 0.5"
              autoComplete="off"
            />
          </div>
          <div className="btn-primary-wrap">
            <button type="button" className="btn-primary" onClick={runSimulation} disabled={loading}>
              {loading ? "Running…" : "Simulate"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <div className="loading-panel" aria-live="polite">
          <span className="loading-line" />
          Fetching pool reserves, route math, and agent recommendations…
        </div>
      )}

      {data && (
        <div className="results-grid">
          <article className="summary-card highlight-card">
            <div className="card-kicker">Best executable view</div>
            <div className="hero-metric">{formatUsd(numberAt(ammLogs, "bestOverall"))}</div>
            <div className="muted-line">Best effective output from {bestDex}</div>
            <div className="route-strip">
              <span>ETH</span>
              <span className="route-arrow">→</span>
              <span>{actionLabel(textAt(strategy, "best_route") ?? execution?.action ?? null)}</span>
              <span className="route-arrow">→</span>
              <span>USDC</span>
            </div>
          </article>

          <article className="summary-card">
            <div className="card-kicker">Total split output</div>
            <div className="card-value">{formatUsd(numberAt(ammLogs, "totalUsdcOutput"))}</div>
            <div className="muted-line">Effective: {formatUsd(numberAt(ammLogs, "totalEffectiveOutput"))}</div>
          </article>

          <article className="summary-card">
            <div className="card-kicker">Multi-hop output</div>
            <div className="card-value">{formatUsd(numberAt(ammLogs, "multiHopOutput"))}</div>
            <div className="muted-line">WETH → USDT → USDC route check</div>
          </article>

          <article className={`summary-card ${riskFlags.length ? "risk-card" : ""}`}>
            <div className="card-kicker">Risk monitor</div>
            <div className="card-value">{riskFlags.length ? `${riskFlags.length} flag` : "Clear"}</div>
            <div className="muted-line">
              {riskFlags.length ? riskFlags.join(", ") : textAt(priceValidation, "status") ?? "No active warning"}
            </div>
          </article>
        </div>
      )}

      {data && (
        <div className="visual-section">
          <div className="section-heading">
            <div>
              <h2>DEX comparison</h2>
              <p>Outputs, slippage, gas, and effective value from the same simulation payload.</p>
            </div>
          </div>

          <div className="dex-grid">
            {dexRows.map((dex) => {
              const barWidth = maxOutput > 0 && dex.usdcOut !== null ? Math.max((dex.usdcOut / maxOutput) * 100, 2) : 0;
              return (
                <article className={`dex-card tone-${dex.tone}`} key={dex.id}>
                  <div className="dex-card-header">
                    <div>
                      <div className="dex-name">{dex.label}</div>
                      <div className="muted-line">{(dex.inputEth ?? simulatedEth) || "0"} ETH input</div>
                    </div>
                    <span className={dex.slippage !== null && Math.abs(dex.slippage) > 3 ? "pill-warn" : "pill-ok"}>
                      {formatPercent(dex.slippage)}
                    </span>
                  </div>
                  <div className="bar-track" aria-label={`${dex.label} output bar`}>
                    <span className="bar-fill" style={{ width: `${barWidth}%` }} />
                  </div>
                  <div className="metric-list">
                    <div>
                      <span>USDC out</span>
                      <strong>{formatNumber(dex.usdcOut)}</strong>
                    </div>
                    <div>
                      <span>Effective</span>
                      <strong>{formatUsd(dex.effectiveOutput)}</strong>
                    </div>
                    <div>
                      <span>Execution price</span>
                      <strong>{formatUsd(dex.executionPrice)}</strong>
                    </div>
                    <div>
                      <span>Gas</span>
                      <strong>{dex.gasLimit ?? "Unavailable"}</strong>
                    </div>
                  </div>
                  <div className="gas-footnote">Estimated gas cost: {formatUsd(dex.gasCost)}</div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {data && poolEntries.length > 0 && (
        <div className="visual-section">
          <div className="section-heading">
            <div>
              <h2>Pool health</h2>
              <p>Live reserve snapshots used by the AMM calculator.</p>
            </div>
          </div>
          <div className="pool-grid">
            {poolEntries.map(({ key, pool }) => (
              <article className="pool-card" key={key}>
                <div className="pool-card-top">
                  <div>
                    <div className="pool-name">{labelFromKey(key)}</div>
                    <div className="muted-line">{textAt(pool, "dex") ?? "DEX pool"}</div>
                  </div>
                  <span className={pool.isStale ? "pill-warn" : "pill-ok"}>{pool.isStale ? "Stale" : "Live"}</span>
                </div>
                <div className="pool-pair">
                  <span>{compactAddress(textAt(pool, "token0"))}</span>
                  <span>↔</span>
                  <span>{compactAddress(textAt(pool, "token1"))}</span>
                </div>
                <dl className="pool-stats">
                  <div>
                    <dt>Reserve 0</dt>
                    <dd>{textAt(pool, "reserve0") ?? "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Reserve 1</dt>
                    <dd>{textAt(pool, "reserve1") ?? "Unavailable"}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="visual-section">
          <div className="section-heading">
            <div>
              <h2>Agent plan</h2>
              <p>Strategy output and executable transaction steps, formatted from the JSON response.</p>
            </div>
          </div>
          <div className="agent-grid">
            <article className="agent-card">
              <div className="card-kicker">Strategy</div>
              <div className="card-value compact-value">{textAt(strategy, "best_route") ?? "Unavailable"}</div>
              <p className="muted-line">{textAt(strategy, "reason") ?? "No strategy explanation returned."}</p>
            </article>

            <article className="agent-card">
              <div className="card-kicker">Execution</div>
              <div className="card-value compact-value">{actionLabel(execution?.action ?? null)}</div>
              {execution?.dex && <p className="muted-line">DEX: {execution.dex}</p>}
              {executionSteps.length > 0 ? (
                <ol className="step-list">
                  {executionSteps.map((step, index) => (
                    <li key={`${step.function}-${index}`}>
                      <span>{index + 1}</span>
                      <code>{step.function}</code>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted-line">{textAt(isRecord(execution) ? execution : null, "reason") ?? "No executable steps returned."}</p>
              )}
            </article>

            <article className="agent-card">
              <div className="card-kicker">Price validation</div>
              <div className="card-value compact-value">{textAt(priceValidation, "status") ?? "Unavailable"}</div>
              <div className="price-grid">
                <span>Birdeye</span>
                <strong>{formatUsd(numberAt(priceValidation, "birdeyePriceUsd"))}</strong>
                <span>Uniswap deviation</span>
                <strong>{formatPercent(numberAt(deviation, "uniswap"))}</strong>
                <span>SushiSwap price</span>
                <strong>{formatUsd(numberAt(poolPrices, "sushiswap"))}</strong>
              </div>
            </article>
          </div>
        </div>
      )}

      {canExecute && (
        <div className="execute-block">
          <button
            type="button"
            className="btn-primary btn-execute"
            onClick={() => void trade.execute(execution, simulatedEth)}
            disabled={trade.running || !isConnected}
          >
            {trade.running ? "Executing…" : `Execute Trade (${simulatedEth} ETH)`}
          </button>
          {!isConnected && <p className="execute-status">Connect your wallet to execute this trade.</p>}
          {trade.status && <p className="execute-status">{trade.status}</p>}
          {trade.hashes.length > 0 && (
            <ol className="tx-list">
              {trade.hashes.map((hash) => (
                <li key={hash}>
                  {chain?.blockExplorers ? (
                    <a href={`${chain.blockExplorers.default.url}/tx/${hash}`} target="_blank" rel="noreferrer">
                      {hash}
                    </a>
                  ) : (
                    <code>{hash}</code>
                  )}
                </li>
              ))}
            </ol>
          )}
          {trade.error && (
            <div className="alert-error" role="alert">
              {trade.error}
            </div>
          )}
        </div>
      )}

      {data && (
        <details className="raw-json-block">
          <summary>Raw JSON response</summary>
          <pre className="code-block">{JSON.stringify(data, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}

export default Simulation;
