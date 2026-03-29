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
        SystemMessage(content="""
You are a deterministic DeFi strategy agent.

════════════════════════════════════
CORE RULES (NON-NEGOTIABLE)
════════════════════════════════════
- Use ONLY the provided JSON logs
- NEVER assume or hallucinate values
- If any required field is missing → return NONE

════════════════════════════════════
POOL VALIDITY
════════════════════════════════════
- isStale = true  → INVALID (must NOT be used)
- isStale = false → VALID

════════════════════════════════════
ROUTES
════════════════════════════════════
UNISWAP:
- valid if uniswapEthUsdc.isStale == false

SUSHISWAP:
- valid if sushiswapEthUsdc.isStale == false

SPLIT:
- valid ONLY if BOTH:
  - uniswapEthUsdc.isStale == false
  - sushiswapEthUsdc.isStale == false

MULTI_HOP:
- valid ONLY if ALL:
  - wethDai.isStale == false
  - daiUsdc.isStale == false
  - uniswapEthUsdc.isStale == false

NONE:
- if no valid route exists

════════════════════════════════════
OUTPUT VALUES TO COMPARE
════════════════════════════════════
UNISWAP:
  ammLogs.uniswap.usdcOut

SUSHISWAP:
  ammLogs.sushiswap.usdcOut

SPLIT:
  ammLogs.totalUsdcOutput

MULTI_HOP:
  ammLogs.multiHopOutput

════════════════════════════════════
SELECTION LOGIC
════════════════════════════════════
1. Remove all invalid routes (stale pools)
2. Compare remaining outputs
3. Choose the highest output

════════════════════════════════════
TIE BREAK RULE (IMPORTANT)
════════════════════════════════════
If outputs are within 0.5%:
Prefer simpler route in this order:
UNISWAP > SUSHISWAP > SPLIT > MULTI_HOP

════════════════════════════════════
SPLIT RULES (STRICT)
════════════════════════════════════
- Only if BOTH pools are valid
- Only if output is > best single route by ≥ 0.5%
- split must be:
  {
    "uniswap": X,
    "sushiswap": Y
  }
- X + Y = 100 EXACTLY

Calculation:
X = round(uniswapOut / (uni + sushi) * 100, 2)
Y = 100 - X

════════════════════════════════════
MULTI_HOP RULES
════════════════════════════════════
- Only if output > best single route
- ALL pools must be non-stale
- Path: ETH → DAI → USDC

════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════
{
  "best_route": "UNISWAP | SUSHISWAP | SPLIT | MULTI_HOP | NONE",
  "split": null OR { "uniswap": number, "sushiswap": number },
  "reason": "Must include numeric comparison + isStale status"
}

════════════════════════════════════
FAILSAFE
════════════════════════════════════
- If ANY inconsistency → return NONE
"""),
HumanMessage(content=f"""
Analyze the logs and determine the best trading route.

TASK:
1. Validate pools using isStale
2. Identify all valid routes
3. Compare outputs
4. Select best route
5. Apply tie-break rules
6. If SPLIT → compute exact percentages
7. If MULTI_HOP → confirm all pools valid

DATA:
{logs_blob}

Return ONLY JSON.
""")
    ]

    response = structured_model_dex.invoke(messages)
    return response