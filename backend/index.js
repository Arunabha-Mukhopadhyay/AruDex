import express from 'express'
import cors from 'cors'

import { STRATEGY_AGENT_URL } from './config.js'
import { EXECUTION_AGENT_URL } from './config.js'
import { ammCalculation , executeSwap, estimateSwapGas } from './ammCal.js'

const app = express()
app.use(cors());
app.use(express.json())


const safeJson = (obj) =>
  JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );


const requestStrategy = async (poolLogs, ammLogs) => {

  const safeStringify = (obj) =>
    JSON.stringify(obj, (_, value) =>
      typeof value === "bigint" ? value.toString() : value
    );

  const response = await fetch(STRATEGY_AGENT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: safeStringify({
      pool_logs: poolLogs,
      amm_logs: ammLogs
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Strategy agent responded with ${response.status}: ${errorText}`);
  }

  return response.json();
};


const requestExecution = async (strategyOutput, poolLogs, ammLogs) => {
  const safeStringify = (obj) =>
    JSON.stringify(obj, (_, value) =>
      typeof value === "bigint" ? value.toString() : value
    );

  const response = await fetch(EXECUTION_AGENT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: safeStringify({
      strategy_output: strategyOutput,
      pool_logs: poolLogs,
      amm_logs: ammLogs
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Execution agent responded with ${response.status}: ${errorText}`);
  }

  return response.json();
};

app.get('/', (req, res) => {
  res.send('Server is working');
});

app.post('/api/amm', async (req, res) => {
  console.log("HIT /api/amm", req.body);

  try {
    const { poolLogs, ammLogs } = await ammCalculation(req);
    const strategy = await requestStrategy(poolLogs, ammLogs);
    const execution = await requestExecution(strategy, poolLogs, ammLogs); 

    const responsePayload = {
      ok: true,
      poolLogs,
      ammLogs,
      strategy,
      execution
    };

    res.send(safeJson(responsePayload));

  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});


app.listen(3000,()=>{
  console.log(`app is running at port 3000`)
})
