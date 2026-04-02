import json
from typing import Any, Dict, Optional

# from langchain_ollama import ChatOllama
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from dotenv import load_dotenv

import os

load_dotenv()

model = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0.2,
    api_key=os.getenv("GROQ_API_KEY")
)


class StrategyDecision(BaseModel):
    best_route: str = Field(
        description="One of UNISWAP, SUSHISWAP, SPLIT, MULTI_HOP, ARBITRAGE, or NONE"
    )
    split: Optional[Dict[str, float]] = Field(
        default=None,
        description="Percentage split per venue when best_route is SPLIT."
    )
    reason: str = Field(
        description="Concise explanation that cites the numeric evidence from the logs."
    )

    arb_details: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Present only if ARBITRAGE is selected"
    )


structured_model_dex = model.with_structured_output(StrategyDecision)




def _format_logs(pool_logs: Dict[str, Any], amm_logs: Dict[str, Any], arb_result) -> str:
    payload = {
        "pool_logs": pool_logs,
        "amm_logs": amm_logs,
        "arb_result": arb_result
    }
    return json.dumps(payload, indent=2, default=str)


# later on we can have the Stratergy Agent also determine if an arbitrage opportunity exists and then execute on it, but for now we will just focus on the Stratergy Agent which determines the best route for a given swap based on the logs from the pool and amm

def arbitrage_calculation(pool_logs: Dict[str, Any], amm_logs: Dict[str, Any]) -> Dict[str, Any]:
    try:
        uni = pool_logs.get("uniswapEthUsdc")
        sushi = pool_logs.get("sushiswapEthUsdc")

        if not uni or not sushi:
            return {"arb": False, "reason": "Missing pool data"}

        if uni.get("isStale") or sushi.get("isStale"):
            return {"arb": False, "reason": "One or more pools are stale"}

        # Outputs from AMM logs
        uni_out = float(amm_logs["uniswap"]["usdcOut"])
        sushi_out = float(amm_logs["sushiswap"]["usdcOut"])

        # ✅ Use REAL gas cost (already computed in backend)
        gas_cost_usdc = float(amm_logs["uniswap"]["gas_cost_usdc"])

        # Arbitrage profits
        profit_uni_to_sushi = sushi_out - uni_out - gas_cost_usdc
        profit_sushi_to_uni = uni_out - sushi_out - gas_cost_usdc

        THRESHOLD_USDC = 5  # avoid noise

        if profit_uni_to_sushi > THRESHOLD_USDC:
            return {
                "arb": True,
                "direction": "UNI_TO_SUSHI",
                "profit_usdc": round(profit_uni_to_sushi, 6),
                "gas_cost_usdc": round(gas_cost_usdc, 6),
                "reason": f"UNI→SUSHI profitable: net {profit_uni_to_sushi:.2f} USDC after gas {gas_cost_usdc:.2f}"
            }

        if profit_sushi_to_uni > THRESHOLD_USDC:
            return {
                "arb": True,
                "direction": "SUSHI_TO_UNI",
                "profit_usdc": round(profit_sushi_to_uni, 6),
                "gas_cost_usdc": round(gas_cost_usdc, 6),
                "reason": f"SUSHI→UNI profitable: net {profit_sushi_to_uni:.2f} USDC after gas {gas_cost_usdc:.2f}"
            }

        return {
            "arb": False,
            "reason": f"No arbitrage after gas. Best profit={max(profit_uni_to_sushi, profit_sushi_to_uni):.2f} USDC"
        }

    except Exception as e:
        return {
            "arb": False,
            "reason": f"Error in arbitrage calculation: {str(e)}"
        }



def stratergy_agent(pool_logs: Dict[str, Any], amm_logs: Dict[str, Any]) -> StrategyDecision:
    arb_result = arbitrage_calculation(pool_logs, amm_logs)

    # if arb_result.get("arb"):
    #   return {
    #     "best_route": "ARBITRAGE",
    #     "split": None,
    #     "reason": arb_result["reason"],
    #     "arb_details": arb_result
    # }

    logs_blob = _format_logs(pool_logs, amm_logs,arb_result)

    messages = [
        SystemMessage(content="""
You are a deterministic DeFi strategy agent.

════════════════════════════════════
CORE RULES (NON-NEGOTIABLE)
════════════════════════════════════
- Use ONLY the provided JSON logs
- NEVER assume values
- NEVER hallucinate
- If data is inconsistent → return NONE

════════════════════════════════════
POOL VALIDITY
════════════════════════════════════
- isStale = true → INVALID
- isStale = false → VALID

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
ARBITRAGE (HIGHEST PRIORITY)
════════════════════════════════════
- Use arb_result from input

- If arb_result.arb == true:
  → ALWAYS select "ARBITRAGE"
  → Ignore ALL other routes
  → arb_details MUST be copied EXACTLY from arb_result
  → DO NOT modify keys or values
  → DO NOT summarize
  → DO NOT recompute
  → reason MUST include:
   - exact profit_usdc value
   - exact gas_cost_usdc value
   - direction (UNI_TO_SUSHI or SUSHI_TO_UNI)
→ If missing → INVALID → return NONE

- If arb_result.arb == false:
  → ARBITRAGE must NOT be selected
- If arb_result fields are missing or inconsistent → return NONE
                      
════════════════════════════════════
ROUTE VALIDITY
════════════════════════════════════
UNISWAP:
  uniswapEthUsdc.isStale == false

SUSHISWAP:
  sushiswapEthUsdc.isStale == false

SPLIT:
  BOTH pools must be valid

MULTI_HOP:
  wethDai, daiUsdc, uniswapEthUsdc must be valid

════════════════════════════════════
OUTPUT METRICS
════════════════════════════════════
UNISWAP:
  ammLogs.uniswap.totalEffectiveOutput

SUSHISWAP:
  ammLogs.sushiswap.totalEffectiveOutput

SPLIT:
  ammLogs.totalUsdcOutput

MULTI_HOP:
  ammLogs.multiHopOutput

════════════════════════════════════
SELECTION LOGIC
════════════════════════════════════
1. Check ARBITRAGE first
2. If no arbitrage:
   - Remove invalid routes
   - Compare outputs
   - Choose highest

════════════════════════════════════
TIE BREAK RULE
════════════════════════════════════
If outputs within 0.5%:
UNISWAP > SUSHISWAP > SPLIT > MULTI_HOP

════════════════════════════════════
SPLIT RULES
════════════════════════════════════
- Only if both pools valid
- Only if improvement ≥ 0.5%
- split must sum EXACTLY 100

════════════════════════════════════
OUTPUT FORMAT (STRICT)
════════════════════════════════════
- If best_route == "ARBITRAGE":
  - arb_details MUST be present
  - arb_details MUST equal arb_result exactly

- If best_route != "ARBITRAGE":
  - arb_details MUST be null

{
  "best_route": "...",
  "split": null OR {...},
  "reason": "...",
  "arb_details": {...} OR null
}

════════════════════════════════════
FAILSAFE
════════════════════════════════════
If ANY inconsistency → return NONE
"""),
HumanMessage(content=f"""
Analyze the logs and determine the optimal trading strategy.

STEPS:
1. Check arbitrage opportunity using arb_result
2. If arbitrage exists → select ARBITRAGE
3. Otherwise:
   - Validate pools
   - Identify valid routes
   - Compare outputs
   - Apply tie-break rules
4. If SPLIT → compute exact percentages

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