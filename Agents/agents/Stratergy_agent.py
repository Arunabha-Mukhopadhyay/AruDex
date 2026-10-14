import json
from typing import Any, Dict, Optional

from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import os

load_dotenv()

model = ChatGroq(
    model="openai/gpt-oss-120b",
    temperature=0.1,
    api_key=os.getenv("GROQ_API_KEY"),
    max_retries=2
)

# model = ChatGoogleGenerativeAI(
#     model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
#     temperature=0.1,
#     google_api_key=os.getenv("GEMINI_API_KEY"),
#     max_retries=0
# )


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
        SystemMessage(content="""You are a deterministic DeFi routing engine. Choose the single best swap strategy using only provided numbers.
Rules:
1. If arb_result.arb == true -> select ARBITRAGE and set arb_details = arb_result.
2. Otherwise, ignore stale pools (isStale == true). Compare effectiveOutput of valid pools (Uniswap, Sushiswap, Multi-Hop, Split).
3. Select route with highest effective output. If tie (<=0.5%), prefer UNISWAP > SUSHISWAP > SPLIT > MULTI_HOP.
4. Output must match StrategyDecision schema."""),
        HumanMessage(content=f"Logs:\n{logs_blob}")
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
