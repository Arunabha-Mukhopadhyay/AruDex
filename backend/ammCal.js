import { ethers } from "ethers";
import { poolSushiSwap, readReserves } from "./pool.js";

const Uniswap_factoryAddress = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"

const SushiSwap_FactoryAddress = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac"

function getAmountOut(amountIn, reserveIn, reserveOut) {
  return  (reserveOut * amountIn * 997n) / (reserveIn * 1000n + amountIn * 997n)
}

// const amountIn = ethers.utils.parseEther("1");
// const reserveIn = readReserves.reserve0 / 1e6;    // USDC
// const reserveOut = readReserves.reserve1 / 1e18;   // WETH

// const price_eth = (reserveOut * 1e18) / (reserveIn * 1e6);

// const amountOut = (reserveOut * amountIn * 997) /
//   (reserveIn * 1000 + amountIn * 997);

async function ammCalculation() {
  const amountIn = ethers.parseEther('1');

  const uni = await readReserves();
  //const sushi = await poolSushiSwap();

  const uniAmountOut = getAmountOut(amountIn, uni.reserve1, uni.reserve0);
  // const sushiAmountOut = getAmountOut(amountIn, sushi.reserve0, sushi.reserve1);

  console.log("Uniswap USDC/WETH:", ethers.formatUnits(uniAmountOut,6));
  //console.log("Sushiswap USDC/WETH:", ethers.formatEther(sushiAmountOut,6));
}

ammCalculation();