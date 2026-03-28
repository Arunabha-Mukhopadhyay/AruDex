from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agents import StrategyDecision, stratergy_agent
from agents import ExecutionPlan, Execution_agent

app = FastAPI()

origins = [
    "http://localhost",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StrategyRequest(BaseModel):
    pool_logs: Dict[str, Any]
    amm_logs: Dict[str, Any]

class ExecutionRequest(BaseModel):
    strategy_output: Dict[str, Any]
    pool_logs: Dict[str, Any]
    amm_logs: Dict[str, Any]


@app.get("/health")
async def health_check() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/strategy", response_model=StrategyDecision)
async def generate_strategy(payload: StrategyRequest) -> StrategyDecision:
    try:
        return stratergy_agent(payload.pool_logs, payload.amm_logs)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post('/api/execution',response_model=ExecutionPlan)
async def execute_sim(payload:ExecutionRequest) -> ExecutionPlan:
    try:
        return Execution_agent(payload.strategy_output,payload.amm_logs,payload.pool_logs)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
