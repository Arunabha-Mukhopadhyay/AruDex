# from langchain_ollama import ChatOllama
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from typing import Any, Dict, Literal, List
import json
import os

from tools.swap_tool import swap_exact_eth_for_tokens
from tools.Approve_tool import approve_token, estimate_gas

load_dotenv()

model = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0.2,
    api_key=os.getenv("GROQ_API_KEY"),
    max_retries=5
)

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



model_with_tools = model.bind_tools([
    swap_exact_eth_for_tokens,
    approve_token,
    estimate_gas
])

structured_output = model_with_tools.with_structured_output(ExecutionPlan)


def _format_execution_input(strategy, pool_logs, amm_logs):
    return json.dumps({
        "strategy": strategy,
        "pool_logs": pool_logs,
        "amm_logs": amm_logs
    }, indent=2, default=str)


def Execution_agent(strategy_output: Dict[str, Any],
                   pool_logs: Dict[str, Any],
                   amm_logs: Dict[str, Any]) -> ExecutionPlan:

    logs_blob = _format_execution_input(strategy_output, pool_logs, amm_logs)

    messages = [


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
CRITICAL NUMERIC RULES:

amount_in_wei:
- MUST be computed as:
  int(float(input_eth) * 1000000000000000000)
- Example:
  40.0 → 40000000000000000000
- If value is smaller than 1e18 → YOU ARE WRONG

min_out:
- MUST be:
  int(usdcOutRaw * 0.99)
- NEVER equal to usdcOutRaw

PATH:
- MUST be FULL TOKEN ADDRESSES
- NEVER use "WETH", "USDC", symbols
-here are the token addresses:
    WETH: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
    USDC:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
    DAI:0x6B175474E89094C44Da98b954EedeAC495271d0F
- For multi-hop, MUST include DAI address in middle
- NEVER use incorrect path
              

swap_exact_eth_for_tokens args:
- MUST be EXACTLY:
  ["DEX", amount_in_wei, min_out, [path]]
- NEVER object
- NEVER key-value pairs

max_slippage:
- MUST be abs(slippage from ammLogs)
- NEVER use 2



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

NEVER:
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
              
here is an example of a valid response:
suppose amount is 10 eth and oneETH is 40 then:
{
  "action": "SINGLE_SWAP",
  "dex": "UNISWAP",
  "steps": [
    {
      "function": "estimate_gas",
      "args": [{
        "dex": "UNISWAP",
        "amount_in": 40000000000000000000,
        "min_out": 102880068014,
        "path": [
          "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
        ]
      }]
    },
    {
      "function": "swap_exact_eth_for_tokens",
      "args": [
        "UNISWAP",
        40000000000000000000,
        102880068014,
        [
          "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
        ]
      ]
    }
  ],
  "input_eth": "40.0",
  "expected_output": "103919.260621",
  "max_slippage": 0.4232456157403351,
  "reason": "Uniswap selected: isStale=false, output 103919.260621 > Sushi 102389.625717"
}
"""),
HumanMessage(content=f"""
DATA:
{logs_blob}

TASK:

1. Read strategy.best_route

Compute STRICTLY:

amount_in_wei = int(float(input_eth) * 1e18)

min_out = int(int(usdcOutRaw) * 0.99)

max_slippage = abs(slippage)

IF any mismatch → ABORT

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