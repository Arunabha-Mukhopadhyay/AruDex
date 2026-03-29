from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from typing import Any, Dict, Literal, List
import json

from tools.swap_tool import swap_exact_eth_for_tokens
from tools.Approve_tool import approve_token, estimate_gas

load_dotenv()

model = ChatOllama(
    model="mistral:latest",
    temperature=0.2
)

# =========================
# SCHEMA
# =========================

class ExecutionStep(BaseModel):
    function: str
    args: list


class ExecutionPlan(BaseModel):
    action: Literal["SINGLE_SWAP", "MULTI_HOP_SWAP", "ABORT"]
    dex: str
    steps: List[ExecutionStep]
    input_eth: str
    expected_output: str
    max_slippage: float
    reason: str


# =========================
# TOOL BINDING
# =========================

model_with_tools = model.bind_tools([
    swap_exact_eth_for_tokens,
    approve_token,
    estimate_gas
])

structured_output = model_with_tools.with_structured_output(ExecutionPlan)


# =========================
# FORMATTER
# =========================

def _format_execution_input(strategy, pool_logs, amm_logs):
    return json.dumps({
        "strategy": strategy,
        "pool_logs": pool_logs,
        "amm_logs": amm_logs
    }, indent=2, default=str)


# =========================
# MAIN AGENT
# =========================

def Execution_agent(strategy_output: Dict[str, Any],
                   pool_logs: Dict[str, Any],
                   amm_logs: Dict[str, Any]) -> ExecutionPlan:

    logs_blob = _format_execution_input(strategy_output, pool_logs, amm_logs)

    messages = [

# =========================
# SYSTEM MESSAGE (FIXED)
# =========================

SystemMessage(content="""
You are a deterministic DeFi execution agent.

════════════════════════════════════
CRITICAL RULE
════════════════════════════════════
- NEVER recompute strategy
- ONLY follow strategy.best_route

════════════════════════════════════
VALID ROUTES
════════════════════════════════════
"UNISWAP"
"SUSHISWAP"
"MULTI_HOP"

Anything else → ABORT

              STRICT VALIDATION:

- If best_route == "UNISWAP":
  → ONLY use ammLogs.uniswap
  → NEVER read ammLogs.sushiswap

- PATH MUST ALWAYS BE:
  ["WETH", "USDC"] for single swap

- swap_exact_eth_for_tokens args MUST be:
  [
    "DEX",
    amount_in_wei,
    min_out,
    path
  ]

- NEVER wrap swap args in object

════════════════════════════════════
SAFETY RULES
════════════════════════════════════
- If selected pool isStale = true → ABORT
- If slippage ≥ 2 → ABORT
- If missing values → ABORT

════════════════════════════════════
TOKEN INFO
════════════════════════════════════
ETH/WETH = 18 decimals
USDC     = 6 decimals

════════════════════════════════════
PATHS (STRICT)
════════════════════════════════════
UNISWAP / SUSHISWAP:
[WETH, USDC]

MULTI_HOP:
[WETH, DAI, USDC]

════════════════════════════════════
CALCULATIONS (EXACT)
════════════════════════════════════

amount_in_wei:
= int(float(input_eth) * 1e18)

min_out:
= int(int(usdcOutRaw) * 0.99)

max_slippage:
= abs(slippage)

expected_output:
= usdcOut (string)

════════════════════════════════════
TOOL SIGNATURES (STRICT)
════════════════════════════════════

estimate_gas:
args = [{
  "dex": "UNISWAP",
  "amount_in": int,
  "min_out": int,
  "path": [...]
}]

swap_exact_eth_for_tokens:
args = [
  "UNISWAP",
  amount_in_wei,
  min_out,
  [path]
]

🚨 NEVER:
- wrap swap args in dict
- use named params
- change order

════════════════════════════════════
STEP ORDER
════════════════════════════════════
1. estimate_gas
2. swap_exact_eth_for_tokens

════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════
{
  "action": "SINGLE_SWAP | MULTI_HOP_SWAP | ABORT",
  "dex": "...",
  "steps": [...],
  "input_eth": "...",
  "expected_output": "...",
  "max_slippage": number,
  "reason": "must include exact values"
}

════════════════════════════════════
FAILSAFE
════════════════════════════════════
If ANY rule violated → return:
{
  "action": "ABORT",
  "dex": "NONE",
  "steps": [],
  "input_eth": "0",
  "expected_output": "0",
  "max_slippage": 0,
  "reason": "Explain failure"
}
"""),
HumanMessage(content=f"""
DATA:
{logs_blob}

TASK:

1. Read strategy.best_route

2. Select source:
- UNISWAP → ammLogs.uniswap
- SUSHISWAP → ammLogs.sushiswap
- MULTI_HOP → ammLogs.uniswap (input) + multiHopOutput

3. Extract:
- input_eth
- usdcOut
- usdcOutRaw
- slippage

4. Compute:
- amount_in_wei
- min_out
- max_slippage

5. Validate safety:
- slippage < 2
- pool not stale

6. Build steps EXACTLY:
- estimate_gas
- swap_exact_eth_for_tokens

7. Return ExecutionPlan JSON ONLY
""")
    ]

    response = structured_output.invoke(messages)
    return response