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
You are a DeFi trading strategy agent.
- Use ONLY the JSON logs provided by the backend.
- Compare single venue, split, and multi-hop routes.
- Prioritise highest output, then lowest slippage, then other considerations.
- If you cannot choose confidently, return best_route="NONE" and explain.
- When best_route="SPLIT" include exact percentages in `split` adding to 100.
- Always justify the recommendation with concrete values from the logs.
            """
        ),
        HumanMessage(
            content=f"Analyze the following pool + AMM simulation logs and output the best route, split (if any), and reason.\n\n```json\n{logs_blob}\n```"
        ),
    ]

    response = structured_model_dex.invoke(messages)
    return response
