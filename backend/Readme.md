# Intent-Based DEX Aggregator (Backend)

This project is a prototype backend for an **intent-based DEX aggregator** that finds the best swap routes across decentralized exchanges by reading liquidity pool reserves and simulating swaps using the AMM formula.

The system fetches live liquidity pool data and calculates optimal swap outputs, supporting **multi-hop routing** and **liquidity splitting**.

---

## Features

- Fetch on-chain liquidity pool reserves
- Simulate swaps using the Uniswap V2 constant product formula
- Multi-hop routing (WETH → DAI → USDC)
- Liquidity splitting across DEX pools
- Slippage estimation
- Binary search optimization for best split
- AMM price simulation
- Birdeye token discovery via trending + new listing feeds
- Birdeye token quality filtering (liquidity, volume, price-change)
- Birdeye external price sanity checks against pool-derived pricing

---

## Tech Stack

- Node.js
- ethers.js
- Ethereum JSON RPC
- dotenv

Protocols used:

- Uniswap V2
- SushiSwap V2

---

## Project Structure
backend/
│
├── ammCal.js # swap simulation & routing logic
├── pool.js # reads on-chain pool reserves
├── factoryAbi.js # Uniswap factory ABI
├── pairAbi.js # pair contract ABI
├── config.js # RPC configuration
├── birdeye.js # Birdeye API integration (discovery + price validation)
├── .env # RPC keys
└── README.md


---

## How It Works

### 1. Fetch Pool Data

The system reads liquidity pool data directly from Uniswap V2 factory contracts.

Example pools used:

WETH / DAI  
DAI / USDC

---

### 2. AMM Swap Formula

Swaps are simulated using the **constant product formula**:
amountOut = (reserveOut * amountIn * 997) /
(reserveIn * 1000 + amountIn * 997)

997 represents the **0.3% swap fee**.


### 3. Multi-Hop Routing

Example route:
WETH → DAI → USDC

### 4. Liquidity Splitting

To minimize slippage, swaps can be split across multiple pools.

The optimal split is found using **binary search optimization**.


## Current Implementation

Implemented:

- Pool reserve fetching
- AMM swap simulation
- Slippage calculation
- Binary search split optimization
- Multi-hop routing
- Birdeye-powered token discovery shortlist
- Birdeye price sanity-check + deviation flagging

## Environment Variables

- `PROVIDER_URL` – JSON-RPC URL for pool reads/swap simulation
- `STRATEGY_AGENT_URL`, `EXECUTION_AGENT_URL` – Agent endpoints
- `BIRDEYE_API_KEY` – enables Birdeye integration
- `BIRDEYE_CHAIN` – Birdeye chain header (default `ethereum`)
- `BIRDEYE_PRICE_DEVIATION_THRESHOLD_PCT` – alert threshold for pool-vs-oracle price gap
- `BIRDEYE_MIN_LIQUIDITY_USD`, `BIRDEYE_MIN_VOLUME_24H_USD`, `BIRDEYE_MAX_ABS_PRICE_CHANGE_24H` – discovery filter controls


Similar systems include:

- 1inch
- Paraswap
- CowSwap

---