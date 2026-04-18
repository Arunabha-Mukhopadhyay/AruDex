import { useState } from "react";
import axios from "axios";

function Simulation() {
  const [oneEth, setOneEth] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    </section>
  );
}

export default Simulation;
