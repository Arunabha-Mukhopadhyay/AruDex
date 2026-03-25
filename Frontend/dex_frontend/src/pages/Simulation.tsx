import React, { useState } from 'react';
import axios from 'axios';

function Simulation() {
  const [amount, setAmount] = useState<string>('');
  const [oneEth, setOneEth] = useState<string>('');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await axios.post('http://localhost:3000/api/amm', {
        amount,
        oneEth
      });

      if (!res.data) {
        throw new Error("No data returned from API");
      }

      setData(res.data);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };




  return (
    <div>
      <input
        type="text"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Enther the amount"
        required
      />
      <input 
        type="text"
        value={oneEth}
        onChange={(e)=>setOneEth(e.target.value)}
        placeholder='Enter the amount of eth'
        required
      />
      <button onClick={() => { setLoading(true); setError(null); setData(null); fetchData(); }} disabled={loading}>
        {loading ? 'Simulating...' : 'Simulate'}
      </button>
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );

}

export default Simulation;