# from langchain_ollama import ChatOllama
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
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
    model="openai/gpt-oss-120b",
    temperature=0.1,
    api_key=os.getenv("GROQ_API_KEY"),
    max_retries=2
)

# model = ChatGoogleGenerativeAI(
#     model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
#     temperature=0.2,
#     google_api_key=os.getenv("GEMINI_API_KEY"),
#     max_retries=0
# )



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


SystemMessage(content="""You are a deterministic DeFi execution agent that builds transaction blueprints.
Rules:
1. Follow strategy.best_route ('UNISWAP', 'SUSHISWAP', or 'MULTI_HOP'). Any other route -> action='ABORT'.
2. If selected pool isStale == true or abs(slippage) >= 2 -> action='ABORT'.
3. Addresses:
   WETH: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
   USDC: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
   DAI:  0x6B175474E89094C44Da98b954EedeAC495271d0F
4. Path: [WETH, USDC] for single swap; [WETH, DAI, USDC] for multi-hop.
5. amount_in_wei = int(float(input_eth) * 1e18)
6. min_out = int(int(usdcOutRaw) * 0.99)
7. steps array must have exactly:
   - function: 'estimate_gas', args: [{'dex': DEX, 'amount_in': amount_in_wei, 'min_out': min_out, 'path': path}]
   - function: 'swap_exact_eth_for_tokens', args: [DEX, amount_in_wei, min_out, path]
8. Return strictly in ExecutionPlan format."""),
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