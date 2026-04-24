import express from 'express'
import cors from 'cors'

import { STRATEGY_AGENT_URL } from './config.js'
import { EXECUTION_AGENT_URL } from './config.js'
import { ammCalculation , executeSwap, estimateSwapGas } from './ammCal.js'

const app = express()

const allowedOrigins = [
  'https://arudex.onrender.com',
  'http://localhost:5173',   // Vite dev server
  'http://localhost:3000',
];

app.use(cors({
  origin(origin, callback) {
    // allow requests with no origin (curl, server-to-server, mobile apps)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
}));

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
    let strategy = null;
    let execution = null;
    try{
      strategy = await requestStrategy(poolLogs, ammLogs);
      execution = await requestExecution(strategy, poolLogs, ammLogs); 
    } catch (agentError) {
      console.warn("Agent unavailable:", agentError.message);
      strategy = { best_route: "UNAVAILABLE", reason: "Agent rate limited or offline" };
      execution = { action: "UNAVAILABLE", reason: "Agent rate limited or offline" };
    }

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


const port = (process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`app is running at port ${port}`);
});
