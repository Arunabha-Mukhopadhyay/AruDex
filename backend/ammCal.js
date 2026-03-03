import { ethers } from "ethers";
import { poolSushiSwap, readReserves } from "./pool.js";

const Uniswap_factoryAddress = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"

const SushiSwap_FactoryAddress = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac"

function getAmountOut(amountIn, reserveIn, reserveOut) {
  return  (reserveOut * amountIn * 997n) / (reserveIn * 1000n + amountIn * 997n)
}

function simulateSwap(amountIn,reserveIn, reserveOut) {
  return (reserveOut * amountIn * 997n) / (reserveIn * 1000n + amountIn * 997n)
}

// const amountIn = ethers.utils.parseEther("1");
// const reserveIn = readReserves.reserve0 / 1e6;    // USDC
// const reserveOut = readReserves.reserve1 / 1e18;   // WETH

// const price_eth = (reserveOut * 1e18) / (reserveIn * 1e6);

// const amountOut = (reserveOut * amountIn * 997) /
//   (reserveIn * 1000 + amountIn * 997);

async function ammCalculation() {
  const amountIn = ethers.parseEther('1'); // 1 ETH
  const oneEth = 10n * 10n ** 18n; // 10 eth

  const uni = await readReserves();
  const sushi = await poolSushiSwap();

  const uniAmountOut = getAmountOut(amountIn, uni.reserve1, uni.reserve0);
  const sushiAmountOut = getAmountOut(amountIn, sushi.reserve1, sushi.reserve0);

  const AmountOutUni = simulateSwap(oneEth, uni.reserve1, uni.reserve0);
  const AmountOutSushi = simulateSwap(oneEth, sushi.reserve1, sushi.reserve0);


  const spotPrice_Uni = ethers.formatUnits(uni.reserve0,6) / ethers.formatUnits(uni.reserve1,18);

  const executionPrice_Uni = ethers.formatUnits(uniAmountOut, 6);
  const Slippage_Uni = ((spotPrice_Uni - executionPrice_Uni) / spotPrice_Uni) * 100;


  console.log("Uniswap USDC/WETH:", ethers.formatUnits(uniAmountOut,6));
  console.log("Sushiswap USDC/WETH:", ethers.formatUnits(sushiAmountOut,6));
  console.log("USDC_Uni out:", ethers.formatUnits(AmountOutUni,6));
  console.log("USDC_SUSHI out:", ethers.formatUnits(AmountOutSushi,6)); // Slippage at 10 eth 

  console.log("Spot price Uniswap:", spotPrice_Uni);
  console.log("Execution price Uniswap:", executionPrice_Uni);
  console.log("Slippage Uniswap:", Slippage_Uni);
}

ammCalculation();