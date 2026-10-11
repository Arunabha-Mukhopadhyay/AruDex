import { useState, useEffect } from "react";
import axios from "axios";
import { useAccount } from "wagmi";
import { useTradeExecutor } from "../useTradeExecutor";
import type { ExecutionPlan } from "../execution";

const EXECUTABLE_ACTIONS = ["SINGLE_SWAP", "MULTI_HOP_SWAP"];

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

  return (
    <section className="panel" aria-labelledby="sim-title">
      <div className="panel-header">
        <h1 id="sim-title" className="panel-title">
          Pool simulation
        </h1>
        <p className="panel-desc">
          Enter an ETH amount and send a POST request to <code>/api/amm </code>to simulate a swap.
          The response shows real-time pool data, estimated output (USDC), and slippage, helping you understand the trade before execution.
        </p>
      </div>

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

      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}

      {data && (
        <div className="output-block">
          <div className="output-label">Response</div>
          <pre className="code-block">{JSON.stringify(data, null, 2)}</pre>
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
    </section>
  );
}

export default Simulation;
