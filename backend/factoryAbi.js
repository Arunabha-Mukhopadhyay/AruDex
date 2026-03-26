export const factoryAbi = [
  "function getPair(address tokenA, address tokenB) view returns (address)"
];

const factorySushiSwapAbi = [
  "function getPair(address,address) view returns (address)"
];

export const routerAbi = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)"
];