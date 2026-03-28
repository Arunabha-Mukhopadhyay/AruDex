from langchain.tools import tool

@tool
def swap_exact_eth_for_tokens(
    dex: str,
    amount_in: int,
    min_out: int,
    path: list
) -> str:
    """
    Execute an ETH to token swap on a DEX.
    Args:
        dex: Target DEX - either 'UNISWAP' or 'SUSHISWAP'
        amount_in: ETH amount in wei
        min_out: Minimum token output in smallest unit (USDC = 6 decimals)
        path: List of token addresses e.g. [WETH, USDC]
    """
    if dex not in ["UNISWAP", "SUSHISWAP"]:
        return f"ERROR: Unknown DEX {dex}"

    if len(path) < 2:
        return "ERROR: Path must have at least 2 tokens"

    if amount_in <= 0:
        return "ERROR: amount_in must be positive"

    if min_out <= 0:
        return "ERROR: min_out must be positive"

    return (
        f"SIMULATED: Swap {amount_in} wei ETH → {path[-1]} "
        f"on {dex} | min_out={min_out} | path={path}"
    )