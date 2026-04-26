import express from 'express'
import cors from 'cors'

import { STRATEGY_AGENT_URL } from './config.js'
import { EXECUTION_AGENT_URL } from './config.js'
import { ammCalculation, executeSwap, estimateSwapGas } from './ammCal.js'

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


const fetchAgentWithRetry = async (url, payload, retries = 3, backoffMs = 3000) => {
  const safeStringify = (obj) =>
    JSON.stringify(obj, (_, value) =>
      typeof value === "bigint" ? value.toString() : value
    );

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: safeStringify(payload)
      });

      if (response.ok) {
        return await response.json();
      }

      const errorText = await response.text();
      // Retry on 5xx errors (e.g. Render 502/503 cold starts, 500 from agent) and 429 rate limit
      const isRetryable = response.status >= 500 || response.status === 429;

      console.warn(`Agent at ${url} responded with ${response.status} (Attempt ${attempt}/${retries}): ${errorText}`);

      if (!isRetryable || attempt === retries) {
        throw new Error(`Agent responded with ${response.status}: ${errorText}`);
      }
    } catch (err) {
      console.warn(`Fetch to ${url} failed (Attempt ${attempt}/${retries}): ${err.message}`);
      if (attempt === retries) {
        throw err;
      }
    }

    // Wait before retrying (exponential backoff)
    await new Promise(res => setTimeout(res, backoffMs * attempt));
  }
};

const requestStrategy = async (poolLogs, ammLogs) => {
  return fetchAgentWithRetry(STRATEGY_AGENT_URL, {
    pool_logs: poolLogs,
    amm_logs: ammLogs
  }, 3, 3000);
};


const requestExecution = async (strategyOutput, poolLogs, ammLogs) => {
  return fetchAgentWithRetry(EXECUTION_AGENT_URL, {
    strategy_output: strategyOutput,
    pool_logs: poolLogs,
    amm_logs: ammLogs
  }, 3, 3000);
};

app.get('/', (req, res) => {
  res.send('Server is working');
});

app.get('/api/health', (req, res) => {
  // Fire and forget ping to agents to wake them up on Render
  const agentHealthUrl = STRATEGY_AGENT_URL.replace('/api/strategy', '/health');
  fetch(agentHealthUrl).catch(() => { });
  res.json({ status: 'ok', message: 'Backend and Agents are waking up' });
});


app.post('/api/amm', async (req, res) => {
  console.log("HIT /api/amm", req.body);

  try {
    const { poolLogs, ammLogs } = await ammCalculation(req);
    let strategy = null;
    let execution = null;
    try {
      strategy = await requestStrategy(poolLogs, ammLogs);
      execution = await requestExecution(strategy, poolLogs, ammLogs);
    } catch (agentError) {
      console.warn("Agent unavailable:", agentError.message);
      strategy = { best_route: "UNAVAILABLE", reason: agentError.message };
      execution = { action: "UNAVAILABLE", reason: agentError.message };
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
