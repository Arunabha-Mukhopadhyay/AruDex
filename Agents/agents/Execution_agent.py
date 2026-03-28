from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from typing import Any, Dict, Optional
import json

from tools.swap_tool import swap_exact_eth_for_tokens
from tools.Approve_tool import approve_token, estimate_gas

load_dotenv()

model = ChatOllama(
    model="mistral:latest",
    temperature=0.2
)

class ExecutionPlan(BaseModel):
    action: str = Field(
        description="One of SINGLE_SWAP, SPLIT_SWAP, MULTI_HOP_SWAP, ABORT"
    )
    dex: Optional[str] = Field(
        default=None,
        description="Target DEX (UNISWAP or SUSHISWAP)"
    )
    steps: list = Field(
        description="Step-by-step execution plan"
    )
    input_eth: str = Field(
        description="ETH amount to use"
    )
    expected_output: str = Field(
        description="Expected USDC output"
    )
    max_slippage: float = Field(
        description="Max allowed slippage (%)"
    )
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
        SystemMessage(
    content="""
You are a DeFi execution agent.

MISSION:
Convert a trading strategy into SAFE, executable blockchain steps.

ROUTER ADDRESSES (memorize these):
- UNISWAP router: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
- SUSHISWAP router: 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F

CRITICAL RULES:
- NEVER use stale pools (isStale = true)
- If chosen route depends on stale pools → ABORT
- slippage must be < 2% (absolute value)
- If unsafe → action = ABORT

ROUTE HANDLING:
1. SINGLE_SWAP → one DEX, dex field = "UNISWAP" or "SUSHISWAP"
2. SPLIT_SWAP  → multiple NON-STALE DEXs, dex field = "UNISWAP,SUSHISWAP"
3. MULTI_HOP_SWAP → only if ALL pools in path are NON-STALE
4. ABORT → if any risk detected

TOOL SIGNATURES (follow EXACTLY):

approve_token(token, spender, amount):
  - token: ERC20 token contract address (string)
  - spender: router address from above (string)
  - amount: integer in wei (never use "all")
  Example: approve_token("0xA0b...", "0x7a250d...", 1000000000)

swap_exact_eth_for_tokens(dex, amount_in, min_out, path):
  - dex: "UNISWAP" or "SUSHISWAP" (string)
  - amount_in: integer in wei
  - min_out: integer in smallest unit (USDC = 6 decimals)
  - path: list of token addresses e.g. ["0xWETH...", "0xUSDC..."]
  Example: swap_exact_eth_for_tokens("UNISWAP", 1000000000000000000, 2600000000, ["0xC02...", "0xA0b..."])

estimate_gas(tx_params):
  - tx_params: dict with keys: dex, amount_in, min_out, path

EXECUTION STEPS ORDER:
1. estimate_gas first
2. approve_token for each token in path
3. swap_exact_eth_for_tokens

OUTPUT FIELD RULES:
- action: one of SINGLE_SWAP, SPLIT_SWAP, MULTI_HOP_SWAP, ABORT
- dex: 
    SINGLE_SWAP → "UNISWAP" or "SUSHISWAP"
    SPLIT_SWAP  → "UNISWAP,SUSHISWAP"
    ABORT       → null
- steps: ordered list of tool calls with correct args
- input_eth: total ETH as decimal string e.g. "1.5"
- expected_output: single pre-calculated number as string e.g. "3921.45" — NEVER a math expression like "x + y"
- max_slippage: absolute value as float e.g. 0.31 (NOT negative)
- reason: cite exact numeric values from logs

FAILSAFE:
- If stale pools are involved → ABORT
- If slippage > 2% → ABORT
- If reserves are too low for trade size → ABORT

Be precise. No assumptions. No hallucination.
"""
),
HumanMessage(
    content=f"""
Given the following data:

{logs_blob}

TASK:
1. Read the strategy's best_route
2. Validate all pools in that route are NON-STALE
3. Calculate min_out = expected_output * (1 - 0.01) in correct decimals
4. Build ordered steps using exact tool signatures above
5. Sum up expected_output as a single number

Return the structured execution plan.
"""
)
    ]

    response = structured_output.invoke(messages)
    return response