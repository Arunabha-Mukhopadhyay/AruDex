import express from 'express'
import cors from 'cors'

import { STRATEGY_AGENT_URL } from './config.js'
import { ammCalculation } from './ammCal.js'

const app = express()
app.use(cors());
app.use(express.json())

const requestStrategy = async (poolLogs, ammLogs) => {
  const response = await fetch(STRATEGY_AGENT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pool_logs: poolLogs, amm_logs: ammLogs })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Strategy agent responded with ${response.status}: ${errorText}`);
  }

  return response.json();
};

app.post('/api/amm', async (req, res) => {
  try {
    const { poolLogs, ammLogs } = await ammCalculation(req);
    const strategy = await requestStrategy(poolLogs, ammLogs);
    res.json({ ok: true, poolLogs, ammLogs, strategy });
  } catch (error) {
    return res.status(404).json({ ok: false, error: error.message });
  }
});

app.listen(3000,()=>{
  console.log(`app is running at port 3000`)
})
