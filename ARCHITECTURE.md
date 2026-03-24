# AruDex — System Architecture

```mermaid
flowchart TD
    subgraph Frontend["Frontend (React + Vite + TypeScript)"]
        main["main.tsx\nApp entry point"]
        App["App.tsx\nRouting"]
        Config["Config.tsx\nWallet / wagmi config"]
        Sim["pages/Simulation.tsx\nSwap Simulation UI"]
        main --> App --> Sim
        App --> Config
    end

    subgraph Backend["Backend (Node.js + Express)"]
        idx["index.js\nExpress Server :3000\nGET /api/amm"]
        ammCal["ammCal.js\nAMM Logic\n- getAmountOut\n- simulateSwap\n- Multi_Hop\n- binaryBestSplit"]
        pool["pool.js\nPool Reserve Fetcher\n- uni_eth_usdc_pool\n- sushi_eth_usdc_pool\n- Weth_DAI_pool\n- Dai_Usdc_pool"]
        cfg["config.js\nRPC URL (from .env)"]
        fAbi["factoryAbi.js\nUniswap V2 Factory ABI"]
        pAbi["pairAbi.js\nPair Contract ABI"]

        idx --> ammCal
        ammCal --> pool
        pool --> cfg
        pool --> fAbi
        pool --> pAbi
    end

    subgraph Ethereum["Ethereum Mainnet (via Alchemy RPC)"]
        direction TB
        subgraph Uniswap["Uniswap V2"]
            uFact["Factory Contract\n0x5C69bEe7..."]
            uWETH_USDC["Pair: WETH / USDC"]
            uWETH_DAI["Pair: WETH / DAI"]
            uDAI_USDC["Pair: DAI / USDC"]
            uFact --> uWETH_USDC & uWETH_DAI & uDAI_USDC
        end
        subgraph SushiSwap["SushiSwap V2"]
            sFact["Factory Contract\n0xC0AEe478..."]
            sWETH_USDC["Pair: WETH / USDC"]
            sFact --> sWETH_USDC
        end
    end

    Sim -- "HTTP GET /api/amm" --> idx
    pool -- "ethers.JsonRpcProvider" --> Ethereum
```

## Data Flow

1. **User** opens the React frontend (`Simulation.tsx`)
2. Frontend calls `GET http://localhost:3000/api/amm`
3. Express server (`index.js`) invokes `ammCalculation()` in `ammCal.js`
4. `ammCal.js` calls `pool.js` functions to fetch live on-chain reserves:
   - **Uniswap V2**: WETH/USDC, WETH/DAI, DAI/USDC pairs
   - **SushiSwap V2**: WETH/USDC pair
5. `pool.js` uses `ethers.js` with Alchemy RPC to query Factory → `getPair()` → `getReserves()`
6. `ammCal.js` runs:
   - **Single-hop swap** simulation (WETH → USDC on Uni & Sushi)
   - **Multi-hop routing** (WETH → DAI → USDC)
   - **Binary search split** to find optimal Uniswap vs SushiSwap allocation
   - **Slippage calculation**
7. Results returned as JSON to the frontend

## Key Algorithms

| Component | Algorithm |
|---|---|
| `getAmountOut` | Uniswap V2 constant product formula with 0.3% fee |
| `Multi_Hop` | Sequential AMM simulation across 2 pools |
| `binaryBestSplit` | Binary search over split ratio to maximise total USDC output |
| `simulateSwap` | Same as `getAmountOut` — used for liquidity-split comparison |
