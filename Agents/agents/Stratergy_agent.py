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
1. You MUST use only the provided JSON logs.
2. Each pool contains an `isStale` flag:
   - If isStale = true → treat that pool as UNRELIABLE.
   - Avoid using stale pools in routing decisions.
   - NEVER include stale pools in SPLIT allocations.
3. If a route depends on stale pools:
   - Penalize it heavily or reject it entirely.
4. Valid route types:
   - UNISWAP → use only Uniswap pools
   - SUSHISWAP → use only SushiSwap pools (ONLY if not stale)
   - SPLIT → divide across multiple NON-STALE pools
   - MULTI_HOP → only if ALL pools in path are NON-STALE
   - NONE → if no safe or reliable route exists

DECISION PRIORITY:
1. Highest output (primary)
2. Lowest slippage
3. Freshness of liquidity (non-stale preferred)
4. Simplicity (prefer single route over complex if similar output)

SPLIT RULES:
- Only include pools where isStale = false
- Percentages MUST sum to 100
- If one pool is stale → do NOT include it in split

MULTI-HOP RULES:
- Only valid if ALL involved pools are non-stale
- Otherwise reject MULTI_HOP

FAILSAFE:
- If all available options involve stale pools → return:
  best_route = "NONE"
  and clearly explain why

OUTPUT:
- Always justify using exact numeric values from logs
- Mention stale condition explicitly if it influenced decision
"""
),
        HumanMessage(
    content=f"""
Analyze the following pool and AMM simulation logs.

Your task:
- Choose the best trading route
- Consider output, slippage, AND pool freshness (isStale)
- Avoid stale pools unless absolutely necessary

Return:
- best_route
- split (if applicable)
- reason with numeric justification

Logs:
```json
{logs_blob}

"""
)
    ]

    response = structured_model_dex.invoke(messages)
    return response
