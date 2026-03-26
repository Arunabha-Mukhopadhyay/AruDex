from langchain.tools import tool

@tool
def swap_exact_eth_for_tokens(dex: str, amount_in: int, min_out: int, path: list):
  """Execute ETH → token swap on a DEX"""
  return f"Swapping {amount_in} on {dex}"

