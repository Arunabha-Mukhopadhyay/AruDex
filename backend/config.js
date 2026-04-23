import dotenv from "dotenv";
dotenv.config();

// import {createConfig} from "@wagmi/core";
// import {metaMask} from "@wagmi/core/connectors/metaMask";
// import { createPublicClient } from "viem";

// export const publicClient = createPublicClient({
//   chain: mainnet,
//   transport: http(),
// });

// export const config = createConfig({
//   chains: [mainnet],
//   connectors:[metaMask()],
//   transports:{
//     [mainnet.id]:http()
//   }
// });

export const PROVIDER_URL = process.env.PROVIDER_URL || "http://hardhat:8545";
export const STRATEGY_AGENT_URL = process.env.STRATEGY_AGENT_URL || "http://agents:5000/api/strategy";
export const EXECUTION_AGENT_URL = process.env.EXECUTION_AGENT_URL || "http://agents:5000/api/execution";

const parseNumberEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || "";
export const BIRDEYE_BASE_URL = process.env.BIRDEYE_BASE_URL || "https://public-api.birdeye.so";
export const BIRDEYE_CHAIN = process.env.BIRDEYE_CHAIN || "ethereum";

export const BIRDEYE_TRENDING_LIMIT = parseNumberEnv(process.env.BIRDEYE_TRENDING_LIMIT, 20);
export const BIRDEYE_NEW_LISTING_LIMIT = parseNumberEnv(process.env.BIRDEYE_NEW_LISTING_LIMIT, 20);
export const BIRDEYE_DISCOVERY_ENRICH_LIMIT = parseNumberEnv(process.env.BIRDEYE_DISCOVERY_ENRICH_LIMIT, 8);
export const BIRDEYE_DISCOVERY_SELECTION_LIMIT = parseNumberEnv(process.env.BIRDEYE_DISCOVERY_SELECTION_LIMIT, 3);
export const BIRDEYE_MIN_LIQUIDITY_USD = parseNumberEnv(process.env.BIRDEYE_MIN_LIQUIDITY_USD, 250000);
export const BIRDEYE_MIN_VOLUME_24H_USD = parseNumberEnv(process.env.BIRDEYE_MIN_VOLUME_24H_USD, 100000);
export const BIRDEYE_MAX_ABS_PRICE_CHANGE_24H = parseNumberEnv(process.env.BIRDEYE_MAX_ABS_PRICE_CHANGE_24H, 80);
export const BIRDEYE_PRICE_DEVIATION_THRESHOLD_PCT = parseNumberEnv(
  process.env.BIRDEYE_PRICE_DEVIATION_THRESHOLD_PCT,
  3
);
