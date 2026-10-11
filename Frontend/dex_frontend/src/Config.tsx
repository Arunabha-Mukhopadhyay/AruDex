import { createPublicClient, http } from "viem";
import { createConfig } from "@wagmi/core";
import { metaMask } from "wagmi/connectors";
import { hardhat, mainnet } from "viem/chains";

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
})

export const config = createConfig({
  chains: [mainnet, hardhat],
  transports:{
    [mainnet.id]: http(import.meta.env.VITE_ALCHEMY_RPC_URL as string),
    [hardhat.id]: http("http://127.0.0.1:8545"),
  },
  connectors:[
    metaMask(),
  ],
})
