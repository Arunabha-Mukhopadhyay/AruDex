import json
from typing import Any, Dict, Optional

from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

model = ChatOllama(
    model="mistral:latest",
    temperature=0.2
)


class StrategyDecision(BaseModel):
    best_route: str = Field(
        description="One of UNISWAP, SUSHISWAP, SPLIT, MULTI_HOP, or NONE."
    )
    split: Optional[Dict[str, float]] = Field(
        default=None,
        description="Percentage split per venue when best_route is SPLIT."
    )
    reason: str = Field(
        description="Concise explanation that cites the numeric evidence from the logs."
    )


structured_model_dex = model.with_structured_output(StrategyDecision)


def _format_logs(pool_logs: Dict[str, Any], amm_logs: Dict[str, Any]) -> str:
    payload = {
        "pool_logs": pool_logs,
        "amm_logs": amm_logs
    }
    return json.dumps(payload, indent=2, default=str)


def stratergy_agent(pool_logs: Dict[str, Any], amm_logs: Dict[str, Any]) -> StrategyDecision:
    logs_blob = _format_logs(pool_logs, amm_logs)
    messages = [
        SystemMessage(
    content="""
You are an advanced DeFi trading strategy agent.

STRICT RULES:
1. Use ONLY the provided JSON logs — no assumptions
2. Each pool has an isStale flag:
   - isStale = true  → UNRELIABLE, never use
   - isStale = false → safe to use
3. Never include stale pools in any route or split

ROUTE DEFINITIONS:
- UNISWAP    → single swap on Uniswap (pool must be non-stale)
- SUSHISWAP  → single swap on SushiSwap (pool must be non-stale)
- SPLIT      → divide ETH across UNISWAP and SUSHISWAP (BOTH must be non-stale)
- MULTI_HOP  → multi-hop path (ALL pools in path must be non-stale)
- NONE       → no safe route exists

SPLIT RULES (very strict):
- split keys must ONLY be "uniswap" and "sushiswap" — never pool names
- percentages MUST sum to exactly 100
- ONLY set best_route = SPLIT when BOTH uniswapEthUsdc AND sushiswapEthUsdc are non-stale
- If either DEX is stale → do NOT use SPLIT, fall back to single route
- SPLIT is only worth it if combined output > best single route by at least 0.5%
- Example of correct split: { "uniswap": 70, "sushiswap": 30 }
- Split ratio = proportional to each DEX's usdcOut from ammLogs
  Example: uniswap=155495, sushi=152068 → total=307563
  uniswap% = round(155495/307563 * 100, 2) = 50.55
  sushiswap% = round(152068/307563 * 100, 2) = 49.45

MULTI_HOP RULES:
- Path is: ETH → WETH → DAI → USDC
- Requires ALL THREE pools to be non-stale:
    1. wethDai (isStale = false)
    2. daiUsdc (isStale = false)
    3. uniswapEthUsdc (isStale = false) — for price comparison
- Use multiHopOutput from ammLogs for comparison
- MULTI_HOP is worth it only if multiHopOutput > best single swap output
- If any pool in path is stale → reject MULTI_HOP entirely

DECISION PRIORITY:
1. Compare ALL valid route outputs:
   - UNISWAP single:   ammLogs.uniswap.usdcOut
   - SUSHISWAP single: ammLogs.sushiswap.usdcOut
   - SPLIT combined:   ammLogs.totalUsdcOutput (only if both non-stale)
   - MULTI_HOP:        ammLogs.multiHopOutput (only if all pools non-stale)
2. Choose route with highest output
3. If outputs are within 0.5% of each other → prefer simpler route
4. Non-stale pools always preferred
5. Simplicity: UNISWAP > SUSHISWAP > SPLIT > MULTI_HOP if outputs similar

ROUTE SELECTION LOGIC:
- Calculate which output is highest among valid routes
- If SPLIT output > single swap by > 0.5% AND both pools non-stale → use SPLIT
- If MULTI_HOP output > best single swap by > 0.5% AND all pools non-stale → use MULTI_HOP
- Otherwise → use whichever single DEX has higher output

IF best_route is UNISWAP or SUSHISWAP:
- split field must be null

IF best_route is SPLIT:
- split must contain exactly: { "uniswap": X, "sushiswap": Y } where X + Y = 100
- calculate ratio from ammLogs usdcOut values

IF best_route is MULTI_HOP:
- split must be null
- mention which pools are used in reason

FAILSAFE:
- If all pools are stale → best_route = "NONE", split = null

OUTPUT:
- Always cite exact numeric values from logs in reason field
- Always mention isStale status of pools considered
- For SPLIT: show the percentage calculation
- For MULTI_HOP: confirm all 3 pools are non-stale
"""),
        HumanMessage(
    content=f"""
Analyze the following pool and AMM simulation logs.

TASK:
1. Check isStale for every pool
2. Identify ALL valid routes:
   - UNISWAP:   uniswapEthUsdc isStale=false → output = ammLogs.uniswap.usdcOut
   - SUSHISWAP: sushiswapEthUsdc isStale=false → output = ammLogs.sushiswap.usdcOut
   - SPLIT:     BOTH uniswapEthUsdc AND sushiswapEthUsdc isStale=false → output = ammLogs.totalUsdcOutput
   - MULTI_HOP: wethDai AND daiUsdc AND uniswapEthUsdc all isStale=false → output = ammLogs.multiHopOutput
3. Compare outputs of all valid routes
4. Choose highest output route
5. If SPLIT is chosen: calculate percentages from usdcOut values, must sum to 100
6. If MULTI_HOP is chosen: confirm all pools in path are non-stale

Logs:
```json
{logs_blob}
```

Return best_route, split (or null), and reason with exact numeric evidence.
"""
)
    ]

    response = structured_model_dex.invoke(messages)
    return response