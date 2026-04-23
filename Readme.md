# AruDex – Intent-Based DEX Aggregator

AruDex is an intent-driven decentralized exchange (DEX) aggregator that combines live on-chain liquidity data, deterministic agent reasoning, and a lightweight React dashboard to recommend and simulate best-execution swaps across Uniswap V2 and SushiSwap pools. The system continuously measures pool freshness, simulates single-hop, split, and multi-hop routes, and produces an execution checklist that can be replayed on-chain.

## Highlights
- Fetches WETH/USDC, WETH/DAI, and DAI/USDC reserves from both Uniswap V2 and SushiSwap factories using `backend/pool.js`.
- Simulates swap outputs and slippage with `backend/ammCal.js`, including binary-search liquidity splitting and optional WETH→DAI→USDC multi-hop routes.
- Adds a Birdeye intelligence layer (`/defi/token_trending`, `/defi/v2/tokens/new_listing`, `/defi/token_overview`) to surface liquid/high-volume candidates before route evaluation.
- Validates pool-implied ETH price against Birdeye `/defi/price` and emits risk flags when deviation crosses a configurable threshold.
- Delegates routing selection to a **Strategy Agent** and transaction assembly to an **Execution Agent** (FastAPI + LangChain + Groq Llama 3.3) before returning an execution recipe.
- Ships a React + Vite frontend with wagmi wallet support so you can input an amount of ETH, call the backend, and inspect the recommended plan.
- Uses Hardhat v3 tooling to fork Ethereum mainnet for deterministic local testing and to supply the JSON-RPC endpoint consumed by every component.

## Monorepo Layout
```
AruDex/
├── backend/                  # Express server, pool math, agent orchestration
├── Agents/                   # FastAPI service exposing /api/strategy and /api/execution
├── Frontend/dex_frontend/    # React + Vite client with wagmi wallet connection
├── contracts/, ignition/,    # Hardhat scaffolding for future on-chain deployment/tests
├── ARCHITECTURE.md           # Mermaid diagram + detailed data flow
└── hardhat.config.ts         # Mainnet-fork setup (block 21,830,000 by default)
```

## End-to-End Flow
1. **Frontend** (`Simulation.tsx`) lets a user enter an ETH amount and invokes `POST /api/amm` on the backend.
2. **Backend** (`index.js`) calls `ammCalculation()` to build `poolLogs` + `ammLogs`, ensuring stale pools are flagged and slippage < 2%.
3. **Strategy Agent** (`Agents/agents/Stratergy_agent.py`) receives those logs and deterministically chooses one of `UNISWAP`, `SUSHISWAP`, `SPLIT`, `MULTI_HOP`, `ARBITRAGE`, or `NONE`.
4. **Execution Agent** (`Agents/agents/Execution_agent.py`) converts the strategy choice into concrete steps such as `estimate_gas` and `swap_exact_eth_for_tokens`, enforcing path/amount/min-out rules.
5. **Backend response** merges raw pool data, AMM analytics, the selected route, and the execution checklist, which the frontend renders for operator review.

## Services
### backend/
- Tech: Node 20+, Express 5, ethers v6.
- Key files: `index.js` (API server + agent orchestration), `ammCal.js` (math + Uniswap router integration), `pool.js` (factory/pair readers).
- Endpoints:
  - `GET /` health check.
  - `POST /api/amm` body `{ "oneEth": "20" }` → returns `{ poolLogs, ammLogs, strategy, execution }`.
- Environment (`backend/.env`):
  - `PROVIDER_URL` – JSON-RPC source (default `http://127.0.0.1:8545`).
  - `STRATEGY_AGENT_URL`, `EXECUTION_AGENT_URL` – FastAPI endpoints.
  - `BIRDEYE_API_KEY` – enables Birdeye discovery + price validation.
  - `BIRDEYE_CHAIN` – chain header for Birdeye calls (default `ethereum`).
  - `BIRDEYE_PRICE_DEVIATION_THRESHOLD_PCT` – threshold for price-sanity flagging.
  - `BIRDEYE_MIN_LIQUIDITY_USD`, `BIRDEYE_MIN_VOLUME_24H_USD`, `BIRDEYE_MAX_ABS_PRICE_CHANGE_24H` – token quality filters for discovery.
  - Optional `PRIVATE_KEY` if you do not want to use the built-in test key.

### Agents/
- Tech: Python 3.10+, FastAPI, LangChain, `langchain_groq`, pydantic.
- Strategy Agent selects the optimal venue or declares NONE; Execution Agent returns structured steps referencing tool functions in `Agents/tools/`.
- Environment (`Agents/.env`):
  - `GROQ_API_KEY` – used for both agents.
  - Any additional service keys (e.g., RPC) if you extend the toolset.
- Run with `uvicorn app:app --host 0.0.0.0 --port 8000`.

### Frontend/dex_frontend/
- Tech: React 18, Vite, wagmi + viem, @tanstack/react-query.
- `App.tsx` wires wallet connection and renders the Simulation form.
- Environment (`Frontend/dex_frontend/.env`):
  - `VITE_ALCHEMY_RPC_URL` – forwarded to wagmi for wallet reads.
- Run with `npm run dev` (default on `http://localhost:5173`).

### Hardhat Tooling
- `hardhat.config.ts` forks Ethereum mainnet at block `21830000` when you run `npx hardhat node`, mirroring liquidity used by the backend/agents.
- `.env` keys consumed by Hardhat:
  - `ALCHEMY_RPC_URL` – mainnet archive node.
  - `SEPOLIA_RPC_URL`, `SEPOLIA_PRIVATE_KEY` – optional for testnet deployments.

## Local Setup
1. **Clone + install dependencies**
   ```bash
   npm install            # root hardhat deps (optional)
   cd backend && npm install && cd -
   cd Frontend/dex_frontend && npm install && cd -
   cd Agents && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```
2. **Create environment files**
   ```bash
   # .env (repo root)
   ALCHEMY_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/...
   SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/...
   SEPOLIA_PRIVATE_KEY=0xabc...

   # backend/.env
   PROVIDER_URL=http://127.0.0.1:8545
   STRATEGY_AGENT_URL=http://127.0.0.1:8000/api/strategy
   EXECUTION_AGENT_URL=http://127.0.0.1:8000/api/execution
   BIRDEYE_API_KEY=your-birdeye-key
   BIRDEYE_CHAIN=ethereum

   # Agents/.env
   GROQ_API_KEY=sk-y0ur-groq-key

   # Frontend/dex_frontend/.env
   VITE_ALCHEMY_RPC_URL=http://127.0.0.1:8545
   ```
3. **Start a forked chain**
   ```bash
   npx hardhat node
   ```
4. **Run agents**
   ```bash
   cd Agents
   source venv/bin/activate
   uvicorn app:app --host 0.0.0.0 --port 8000 --reload
   ```
5. **Run backend**
   ```bash
   cd backend
   node index.js   # or add "start": "node index.js" to package.json and use npm run start
   ```
6. **Run frontend**
   ```bash
   cd Frontend/dex_frontend
   npm run dev
   ```
7. Open the UI, enter an ETH amount, submit, and inspect the JSON containing pool logs, selected strategy, and execution plan.

## Testing & Next Steps
- `npx hardhat test` runs the placeholder Hardhat suite; extend it with fork tests for new pools.
- Add backend unit tests (e.g., via vitest) for `binaryBestSplit`, `Multi_Hop`, and slippage guards.
- Replace the mocked swap/approve tools with on-chain integrations once you are ready to broadcast transactions.
- Consider wiring wagmi actions directly to the execution plan so advanced users can replay steps without leaving the dashboard.
