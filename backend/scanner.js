import { EventEmitter } from 'events';
import { ammCalculation } from './ammCal.js';
import { STRATEGY_AGENT_URL, EXECUTION_AGENT_URL } from './config.js';

export const scannerEmitter = new EventEmitter();

const safeStringify = (obj) =>
  JSON.stringify(obj, (_, value) =>
    typeof value === "bigint" ? value.toString() : value
  );

const trimPayload = (poolLogs, ammLogs) => {
  const trimmedPoolLogs = { ...poolLogs };
  const trimmedAmmLogs = { ...ammLogs };
  
  if (trimmedPoolLogs.birdeyeDiscovery) delete trimmedPoolLogs.birdeyeDiscovery;
  if (trimmedAmmLogs.birdeye?.discovery) delete trimmedAmmLogs.birdeye.discovery;

  return { trimmedPoolLogs, trimmedAmmLogs };
};

const fetchAgentWithRetry = async (url, payload, retries = 3, backoffMs = 3000) => {
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
      const isRetryable = response.status >= 500 || response.status === 429;

      console.warn(`[Scanner] Agent at ${url} responded with ${response.status} (Attempt ${attempt}/${retries}): ${errorText}`);

      if (!isRetryable || attempt === retries) {
        throw new Error(`Agent responded with ${response.status}: ${errorText}`);
      }
    } catch (err) {
      console.warn(`[Scanner] Fetch to ${url} failed (Attempt ${attempt}/${retries}): ${err.message}`);
      if (attempt === retries) {
        throw err;
      }
    }

    await new Promise(res => setTimeout(res, backoffMs * attempt));
  }
};

export const startScanner = (scanAmountEth) => {
  console.log(`[Scanner] Starting automated background scanner with ${scanAmountEth} ETH`);

  const scanLoop = async () => {
    try {
      console.log(`[Scanner] Running scan for ${scanAmountEth} ETH...`);
      const { poolLogs, ammLogs } = await ammCalculation(scanAmountEth);

      const { trimmedPoolLogs, trimmedAmmLogs } = trimPayload(poolLogs, ammLogs);

      const strategyOutput = await fetchAgentWithRetry(STRATEGY_AGENT_URL, {
        pool_logs: trimmedPoolLogs,
        amm_logs: trimmedAmmLogs
      });

      if (strategyOutput && strategyOutput.best_route === 'ARBITRAGE') {
        console.log("[Scanner] Arbitrage opportunity found! Generating execution blueprint...");
        
        // Delay for 1.5 seconds to prevent free-tier API burst rate limits
        await new Promise(resolve => setTimeout(resolve, 1500));

        const executionBlueprint = await fetchAgentWithRetry(EXECUTION_AGENT_URL, {
          strategy_output: strategyOutput,
          pool_logs: trimmedPoolLogs,
          amm_logs: trimmedAmmLogs
        });
        
        console.log("[Scanner] Execution blueprint ready! Emitting event...");
        scannerEmitter.emit('arbitrageFound', {
          strategy: strategyOutput,
          execution: executionBlueprint
        });
      } else {
        console.log(`[Scanner] No profitable arbitrage found. Best route: ${strategyOutput?.best_route || 'Unknown'}`);
      }
    } catch (error) {
      console.error("[Scanner] Error during scan:", error.message);
    }

    // Schedule the next scan in 60 seconds
    setTimeout(scanLoop, 60000);
  };

  // Start the first scan
  scanLoop();
};
