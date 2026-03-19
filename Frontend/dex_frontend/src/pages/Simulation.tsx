import React, { useState } from 'react';
import axios from 'axios';

function Simulation() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async() => {
    const res = await  axios.get('http://localhost:3000/api/amm')
      .then((res) => {
        if (!res.data) {
          throw new Error("No data returned from API");
        }
        setData(res.data);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };




  return (
    <div>
      <button onClick={() => { setLoading(true); setError(null); setData(null); fetchData(); }} disabled={loading}>
        {loading ? 'Simulating...' : 'Simulate'}
      </button>
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );

  // ...existing code...
}

export default Simulation;