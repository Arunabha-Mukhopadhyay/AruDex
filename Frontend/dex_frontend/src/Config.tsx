import { createPublicClient, http } from "viem";
import { createConfig } from "@wagmi/core";
import { metaMask } from "wagmi/connectors";
import { mainnet } from "viem/chains";

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
})

export const config = createConfig({
  chains: [mainnet],
  transports:{
    [mainnet.id]: http(import.meta.env.VITE_ALCHEMY_RPC_URL as string),
  },
  connectors:[
    metaMask(),
  ],
})