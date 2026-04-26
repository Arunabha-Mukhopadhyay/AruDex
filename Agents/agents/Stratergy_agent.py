import json
from typing import Any, Dict, Optional

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import os

load_dotenv()

model = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0.1,
    api_key=os.getenv("GROQ_API_KEY"),
    max_retries=5
)


class StrategyDecision(BaseModel):
    best_route: str = Field(
        description="One of UNISWAP, SUSHISWAP, SPLIT, MULTI_HOP, ARBITRAGE, or NONE"
    )
    split: Optional[Dict[str, float]] = Field(
        default=None,
        description="Percentage split when SPLIT is chosen"
    )
    reason: str
    arb_details: Optional[Dict[str, Any]] = None


structured_model_dex = model.with_structured_output(StrategyDecision)


def _format_logs(pool_logs: Dict[str, Any], amm_logs: Dict[str, Any], arb_result: Dict[str, Any]) -> str:
    payload = {
        "pool_logs": pool_logs,
        "amm_logs": amm_logs,
        "arb_result": arb_result
    }
    return json.dumps(payload, indent=2, default=str)



def arbitrage_calculation(pool_logs: Dict[str, Any], amm_logs: Dict[str, Any]) -> Dict[str, Any]:
    try:
        uni = pool_logs.get("uniswapEthUsdc")
        sushi = pool_logs.get("sushiswapEthUsdc")

        if not uni or not sushi:
            return {"arb": False, "reason": "Missing pool data"}

        if uni.get("isStale") or sushi.get("isStale"):
            return {"arb": False, "reason": "Stale pool detected"}

        if "arb" not in amm_logs:
            return {"arb": False, "reason": "No arb logs"}

        arb_logs = amm_logs["arb"]

        uni_to_sushi = arb_logs.get("uni_to_sushi")
        sushi_to_uni = arb_logs.get("sushi_to_uni")

        if not uni_to_sushi or not sushi_to_uni:
            return {"arb": False, "reason": "Incomplete arb logs"}

        profit_uts = float(uni_to_sushi["netProfit"])
        profit_stu = float(sushi_to_uni["netProfit"])

        THRESHOLD = 5  # avoid noise

        if profit_uts > THRESHOLD:
            return {
                "arb": True,
                "direction": "UNI_TO_SUSHI",
                "profit_usdc": profit_uts,
                "reason": f"UNI→SUSHI net profit {profit_uts:.2f} USDC"
            }

        if profit_stu > THRESHOLD:
            return {
                "arb": True,
                "direction": "SUSHI_TO_UNI",
                "profit_usdc": profit_stu,
                "reason": f"SUSHI→UNI net profit {profit_stu:.2f} USDC"
            }

        return {
            "arb": False,
            "reason": f"No profitable arbitrage. Max profit={max(profit_uts, profit_stu):.2f}"
        }

    except Exception as e:
        return {
            "arb": False,
            "reason": f"Arb calc error: {str(e)}"
        }



def strategy_agent(pool_logs: Dict[str, Any], amm_logs: Dict[str, Any]) -> StrategyDecision:

    arb_result = arbitrage_calculation(pool_logs, amm_logs)
    logs_blob = _format_logs(pool_logs, amm_logs, arb_result)

    messages = [

        SystemMessage(content="""
You are an advanced deterministic DeFi routing engine.

Your job is to select the SINGLE best execution strategy using ONLY the provided logs.

════════════════════════════════════
STRICT RULES
════════════════════════════════════
- DO NOT hallucinate
- DO NOT assume missing values
- DO NOT recompute AMM math
- ONLY use numbers from JSON
- If inconsistency → return NONE

════════════════════════════════════
AVAILABLE ROUTES
════════════════════════════════════
UNISWAP
SUSHISWAP
SPLIT
MULTI_HOP
ARBITRAGE
NONE

════════════════════════════════════
POOL VALIDITY
════════════════════════════════════
A pool is VALID if:
- isStale == false

INVALID if:
- isStale == true

════════════════════════════════════
METRICS (FROM BACKEND)
════════════════════════════════════
UNISWAP:
- amm_logs.uniswap.effectiveOutput

SUSHISWAP:
- amm_logs.sushiswap.effectiveOutput

SPLIT:
- amm_logs.totalUsdcOutput

MULTI_HOP:
- amm_logs.multiHopOutput

ARBITRAGE:
- USE arb_result ONLY
- DO NOT recompute

════════════════════════════════════
ARBITRAGE PRIORITY (HIGHEST)
════════════════════════════════════
IF arb_result.arb == true:
→ ALWAYS select ARBITRAGE
→ IGNORE everything else
→ arb_details MUST equal arb_result EXACTLY

════════════════════════════════════
ROUTE VALIDATION
════════════════════════════════════
UNISWAP → uniswapEthUsdc valid
SUSHISWAP → sushiswapEthUsdc valid
SPLIT → BOTH valid
MULTI_HOP → wethDai + daiUsdc valid

════════════════════════════════════
SELECTION LOGIC
════════════════════════════════════
1. Check ARBITRAGE
2. Remove invalid routes
3. Compare outputs
4. Choose highest

════════════════════════════════════
TIE BREAK (≤0.5%)
════════════════════════════════════
UNISWAP > SUSHISWAP > SPLIT > MULTI_HOP

════════════════════════════════════
SPLIT RULE
════════════════════════════════════
- Only if BOTH pools valid
- Only if improvement ≥ 0.5%
- split must sum to EXACTLY 100

════════════════════════════════════
OUTPUT FORMAT (STRICT JSON)
════════════════════════════════════
{
  "best_route": "...",
  "split": null OR {...},
  "reason": "...",
  "arb_details": {...} OR null
}

════════════════════════════════════
FAILSAFE
════════════════════════════════════
If ANY inconsistency → return:
{
  "best_route": "NONE",
  "split": null,
  "reason": "Inconsistent or insufficient data",
  "arb_details": null
}
"""),
        HumanMessage(content=f"""
Analyze the following DeFi execution logs and determine the optimal strategy.

STEPS:
1. Evaluate arbitrage using arb_result
2. If arbitrage exists → SELECT ARBITRAGE
3. Otherwise:
   - Validate pools
   - Compare outputs:
     • Uniswap → effectiveOutput
     • Sushi → effectiveOutput
     • Split → totalUsdcOutput
     • Multi-hop → multiHopOutput
4. Apply tie-break rules if needed
5. If SPLIT → compute exact % allocation

IMPORTANT:
- Use ONLY provided numbers
- DO NOT recompute anything
- Be deterministic

DATA:
{logs_blob}

Return ONLY JSON.
""")
    ]

    response = structured_model_dex.invoke(messages)

    if arb_result.get("arb") and response.best_route != "ARBITRAGE":
        return StrategyDecision(
            best_route="ARBITRAGE",
            split=None,
            reason=arb_result["reason"],
            arb_details=arb_result
        )

    return response


def stratergy_agent(pool_logs: Dict[str, Any], amm_logs: Dict[str, Any]) -> StrategyDecision:
    # Backwards-compatible alias expected by FastAPI import wiring
    return strategy_agent(pool_logs, amm_logs)
