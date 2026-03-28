import {ethers} from "ethers";
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

//export const PROVIDER_URL = process.env.ALCHEMY_RPC_URL;
export const PROVIDER_URL = "http://127.0.0.1:8545"
export const STRATEGY_AGENT_URL = process.env.STRATEGY_AGENT_URL || "http://127.0.0.1:8000/api/strategy";
export const EXECUTION_AGENT_URL = process.env.EXECUTION_AGENT_URL || "http://127.0.0.1:8000/api/execution"
