@tool
def approve_token(token: str, spender: str, amount: int):
  """Approve ERC20 token"""
  return "approved"

@tool
def estimate_gas(tx_params: dict):
  """Estimate gas"""
  return "210000"