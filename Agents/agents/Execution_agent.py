from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from typing import Any, Dict
import json

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

structured_output = model_with_tools.with_structured_output(Execution)

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

CRITICAL RULES:
- NEVER use stale pools (isStale = true)
- If chosen route depends on stale pools → ABORT
- ALWAYS verify:
  - liquidity (reserves >> trade size)
  - slippage is acceptable (<2%)
- If unsafe → action = ABORT

ROUTE HANDLING:
1. SINGLE_SWAP:
   - Use one DEX only
2. SPLIT_SWAP:
   - Split capital across NON-STALE DEXs
3. MULTI_HOP_SWAP:
   - Only if ALL pools are NON-STALE
4. ABORT:
   - If any risk detected

TOOLS AVAILABLE:
- approve_token
- swap_exact_eth_for_tokens
- estimate_gas

EXECUTION LOGIC:
1. Validate route
2. Calculate min_out using slippage
3. Estimate gas
4. Simulate swap
5. If simulation fails → ABORT

OUTPUT FORMAT:
- action
- dex
- steps (ordered tool calls)
- input_eth
- expected_output
- max_slippage
- reason

Be precise. No assumptions. No hallucination.
"""
        ),
        HumanMessage(
            content=f"""
Given the following:

{logs_blob}

TASK:
Convert strategy into execution plan.

IMPORTANT:
- Ignore stale pools
- Use only safe routes
- Include tool usage steps

Return structured execution plan.
"""
        )
    ]

    response = structured_output.invoke(messages)
    return response