from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from typing import Any, Dict, Optional, Literal,List
import json

from tools.swap_tool import swap_exact_eth_for_tokens
from tools.Approve_tool import approve_token, estimate_gas

load_dotenv()

model = ChatOllama(
    model="mistral:latest",
    temperature=0.2
)

class ExecutionStep(BaseModel):
    function: str = Field(
        description="Tool name: estimate_gas, approve_token, or swap_exact_eth_for_tokens"
    )
    args: list = Field(
        description="Positional arguments for the tool in correct order"
    )

class ExecutionPlan(BaseModel):
    action: Literal["SINGLE_SWAP", "SPLIT_SWAP", "MULTI_HOP_SWAP", "ABORT"] = Field(
        description="Exactly one of: SINGLE_SWAP, SPLIT_SWAP, MULTI_HOP_SWAP, ABORT. NEVER use Execute or any other value."
    )
    dex: str = Field(
        description="SINGLE_SWAP → UNISWAP or SUSHISWAP. SPLIT_SWAP → UNISWAP,SUSHISWAP. ABORT → NONE. NEVER return null."
    )
    steps: List[ExecutionStep] = Field(
        description="Ordered steps: 1) estimate_gas 2) approve_token 3) swap_exact_eth_for_tokens"
    )
    input_eth: str = Field(
        description="Total ETH as human readable decimal string e.g. '47.95'"
    )
    expected_output: str = Field(
        description="Expected USDC as human readable decimal string e.g. '155495.87'. NEVER in wei."
    )
    max_slippage: float = Field(
        description="Absolute positive slippage value e.g. 0.31. NEVER negative."
    )
    reason: str = Field(
        description="Cite exact numeric values from logs to justify decision."
    )

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
You are a DeFi execution agent. Your job is to convert a trading strategy into a precise, safe, executable blockchain plan.

═══════════════════════════════════════════
ADDRESSES (hardcoded — never change these)
═══════════════════════════════════════════
UNISWAP router:   0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
SUSHISWAP router: 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F
WETH:             0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
USDC:             0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
DAI:              0x6B175474E89094C44Da98b954EedeAC495271d0F

═══════════════════════════════════════════
TOKEN DECIMALS (never mix these up)
═══════════════════════════════════════════
ETH / WETH = 18 decimals
DAI        = 18 decimals
USDC       =  6 decimals  ← always use this for min_out

═══════════════════════════════════════════
SAFETY RULES (if any fail → ABORT)
═══════════════════════════════════════════
- NEVER use a pool where isStale = true
- slippage must be < 2% absolute value
- reserves must be much larger than trade size
- If ANY safety rule fails → set action = ABORT

═══════════════════════════════════════════
ACTION FIELD — ONLY these 4 values allowed
═══════════════════════════════════════════
SINGLE_SWAP    → swapping on one DEX
SPLIT_SWAP     → splitting across two DEXs
MULTI_HOP_SWAP → multi-hop path (e.g. ETH→DAI→USDC)
ABORT          → unsafe trade detected

NEVER use: "Execute", "Swap", "Trade" or any other value.

═══════════════════════════════════════════
DEX FIELD RULES — never return null
═══════════════════════════════════════════
SINGLE_SWAP    → dex = "UNISWAP" or "SUSHISWAP"
SPLIT_SWAP     → dex = "UNISWAP,SUSHISWAP"
MULTI_HOP_SWAP → dex = "UNISWAP" or "SUSHISWAP"
ABORT          → dex = "NONE"

═══════════════════════════════════════════
PATH RULES
═══════════════════════════════════════════
- path MUST always have at least 2 token addresses
- NEVER put only 1 token in path
- ETH → USDC:        ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"]
- ETH → DAI:         ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0x6B175474E89094C44Da98b954EedeAC495271d0F"]
- ETH → DAI → USDC: ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0x6B175474E89094C44Da98b954EedeAC495271d0F", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"]

═══════════════════════════════════════════
CALCULATION RULES (follow exactly)
═══════════════════════════════════════════

amount_in_wei:
  = int(inputEth_from_ammLogs * 1_000_000_000_000_000_000)
  Example: 39.1126708984375 ETH → 39112670898437500000

min_out (USDC, 6 decimals):
  = int(usdcOut_from_ammLogs * 0.99 * 1_000_000)
  Example: 127160.145182 USDC → int(127160.145182 * 0.99 * 1000000) = 125888543730
  NEVER use 18 decimals for USDC
  NEVER copy min_out from estimate_gas as the USDC amount

max_slippage:
  = abs(slippage value from ammLogs)
  Example: slippage = -0.312 → max_slippage = 0.312
  NEVER return 0
  NEVER return negative

expected_output:
  = usdcOut as human readable decimal string
  Example: "127160.145182"
  NEVER in wei
  NEVER a math expression like "x + y"

input_eth:
  = inputEth from ammLogs as decimal string
  Example: "39.1126708984375"

═══════════════════════════════════════════
TOOL SIGNATURES (follow exactly)
═══════════════════════════════════════════

IMPORTANT: args MUST always be a flat positional list.
NEVER wrap args in a dict like {"dex": ..., "amount": ...}
NEVER use named args like {"tokenAddress": ..., "value": ...}

1. estimate_gas — takes ONE dict argument:
   args = [{
     "dex": "UNISWAP",
     "amount_in": <amount_in_wei as integer>,
     "min_out": <min_out as integer>,
     "path": ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"]
   }]

2. approve_token — takes 3 positional args:
   args = [
     "<output token address>",     ← USDC: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
     "<router address>",            ← UNISWAP: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
     <min_out as integer>           ← e.g. 125888543730
   ]
   NEVER use placeholders like <YOUR_TOKEN_SPENDER>
   NEVER wrap in a dict

3. swap_exact_eth_for_tokens — takes 4 positional args:
   args = [
     "UNISWAP",                     ← dex string
     <amount_in_wei as integer>,    ← e.g. 39112670898437500000
     <min_out as integer>,          ← e.g. 125888543730
     ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"]
   ]
   NEVER wrap in a dict
   NEVER use key names like "amountIn", "minAmountOut", "tokenAddress"

═══════════════════════════════════════════
STEPS ORDER (always follow this order)
═══════════════════════════════════════════
Step 1: estimate_gas
Step 2: approve_token
Step 3: swap_exact_eth_for_tokens

═══════════════════════════════════════════
COMPLETE EXAMPLE OUTPUT
═══════════════════════════════════════════
{
  "action": "SINGLE_SWAP",
  "dex": "UNISWAP",
  "steps": [
    {
      "function": "estimate_gas",
      "args": [{
        "dex": "UNISWAP",
        "amount_in": 39112670898437500000,
        "min_out": 125888543730,
        "path": ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"]
      }]
    },
    {
      "function": "approve_token",
      "args": [
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
        125888543730
      ]
    },
    {
      "function": "swap_exact_eth_for_tokens",
      "args": [
        "UNISWAP",
        39112670898437500000,
        125888543730,
        ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"]
      ]
    }
  ],
  "input_eth": "39.1126708984375",
  "expected_output": "127160.145182",
  "max_slippage": 0.312,
  "reason": "UNISWAP output 127160.145182 USDC > SushiSwap 124867.009581 USDC. uniswapEthUsdc isStale=false. Slippage 0.312% < 2% limit."
}

Be precise. No assumptions. No hallucination. Follow every rule exactly.
"""
),
HumanMessage(
    content=f"""
Given the following data:

{logs_blob}

TASK — follow these steps in order:

1. Read strategy.best_route to determine action type
2. Check isStale for every pool in that route — if any is true → ABORT
3. Extract from ammLogs:
   - inputEth  → from ammLogs.[dex].inputEth
   - usdcOut   → from ammLogs.[dex].usdcOut
   - slippage  → from ammLogs.[dex].slippage
4. Calculate:
   - amount_in_wei = int(inputEth * 10^18)
   - min_out       = int(usdcOut * 0.99 * 10^6)
   - max_slippage  = abs(slippage)
5. Build steps using EXACT tool signatures from system prompt
6. Fill all output fields using the calculated values above

Return the structured execution plan.
"""
)
    ]

    response = structured_output.invoke(messages)
    return response