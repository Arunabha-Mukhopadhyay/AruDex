from langchain.tools import tool  

@tool
def approve_token(token: str, spender: str, amount: int) -> str:
    """
    Approve an ERC20 token for spending by a spender address.
    Args:
        token: ERC20 token contract address
        spender: Address allowed to spend (e.g. Uniswap router)
        amount: Amount to approve in wei
    """
    return f"Approved {amount} of {token} for {spender}"


@tool
def estimate_gas(tx_params: dict) -> str:
    """
    Estimate gas for a transaction.
    Args:
        tx_params: Dict with keys: to, data, value, from
    """
    return "210000"