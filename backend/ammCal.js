import { ethers } from "ethers";
// import { poolSushiSwap, readReserves, Weth_DAI_pool, DAI_USDC_pool } from "./pool.js";
import { uni_eth_usdc_pool, sushi_eth_usdc_pool, Weth_Dai_pool, Dai_Usdc_pool, Weth_DAI_pool } from "./pool.js";

function getAmountOut(amountIn, reserveIn, reserveOut) {
  return (reserveOut * amountIn * 997n) / (reserveIn * 1000n + amountIn * 997n)
}

function simulateSwap(amountIn, reserveIn, reserveOut) {
  return (reserveOut * amountIn * 997n) / (reserveIn * 1000n + amountIn * 997n)
}

async function Multi_Hop(amountIn, pool1, pool2) {
  const amountOut_1 = simulateSwap(amountIn, pool1.reserve1, pool1.reserve0);
  const amountOut_2 = simulateSwap(amountOut_1, pool2.reserve0, pool2.reserve1);
  const totalOutput = amountOut_2;
  return totalOutput;
}

function totalOutput(amountUni, totalAmount, uniPool, sushiPool) {
  const amountSushi = totalAmount - amountUni;
  const uniOut = simulateSwap(
    amountUni,
    uniPool.reserve1,
    uniPool.reserve0
  );

  const sushiOut = simulateSwap(
    amountSushi,
    sushiPool.reserve1,
    sushiPool.reserve0
  );

  return uniOut + sushiOut;
}


function binaryBestSplit(totalAmount, uniPool, sushiPool) {

  let left = 0n;
  let right = totalAmount;
  const step = 10n ** 14n; // precision step

  let bestAmount = 0n;
  let bestOutput = 0n;

  while (right - left > step) {
    const mid = (left + right) / 2n;
    const midNext = mid + step;
    const outMid = totalOutput(mid, totalAmount, uniPool, sushiPool);
    const outNext = totalOutput(midNext, totalAmount, uniPool, sushiPool);

    if (outNext > outMid) {
      left = mid;
    } else {
      right = mid;
    }

    if (outMid > bestOutput) {
      bestOutput = outMid;
      bestAmount = mid;
    }
  }

  return {
    uniInput: bestAmount,
    sushiInput: totalAmount - bestAmount,
    bestOutput
  };
}


// const amountIn = ethers.utils.parseEther("1");
// const reserveIn = readReserves.reserve0 / 1e6;    // USDC
// const reserveOut = readReserves.reserve1 / 1e18;   // WETH

// const price_eth = (reserveOut * 1e18) / (reserveIn * 1e6);

// const amountOut = (reserveOut * amountIn * 997) /
//   (reserveIn * 1000 + amountIn * 997);


export const ammCalculation = async(req) => {
  const { amount, oneEth: oneEthStr } = req.body;
  const amountIn = ethers.parseEther(amount);
  const oneEth = ethers.parseEther(oneEthStr);
  const uni = await uni_eth_usdc_pool();
  const sushi = await sushi_eth_usdc_pool();

  const dai = await Weth_DAI_pool();
  const dai_usdc = await Dai_Usdc_pool();

  const amountOut_MultiHop = await Multi_Hop(oneEth, dai, dai_usdc);
  //console.log("Multi Hop Output:", ethers.formatUnits(amountOut_MultiHop, 6));


  const uniAmountOut = getAmountOut(amountIn, uni.reserve1, uni.reserve0);
  const sushiAmountOut = getAmountOut(amountIn, sushi.reserve1, sushi.reserve0);

  const AmountOutUni = simulateSwap(oneEth, uni.reserve1, uni.reserve0);
  const AmountOutSushi = simulateSwap(oneEth, sushi.reserve1, sushi.reserve0);

  const spotPrice_Uni = ethers.formatUnits(uni.reserve0, 6) / ethers.formatUnits(uni.reserve1, 18);
  const executionPrice_Uni = ethers.formatUnits(uniAmountOut, 6);
  const Slippage_Uni = ((spotPrice_Uni - executionPrice_Uni) / spotPrice_Uni) * 100;

  const result = binaryBestSplit(oneEth, uni, sushi);

  // console.log("Uniswap USDC/WETH:", ethers.formatUnits(uniAmountOut, 6));
  // console.log("Sushiswap USDC/WETH:", ethers.formatUnits(sushiAmountOut, 6));
  // console.log("USDC_Uni out:", ethers.formatUnits(AmountOutUni, 6));
  // console.log("USDC_SUSHI out:", ethers.formatUnits(AmountOutSushi, 6)); // Slippage at 10 eth 

  
  // console.log("Spot price Uniswap:", spotPrice_Uni);
  // console.log("Execution price Uniswap:", executionPrice_Uni);
  // console.log("Slippage Uniswap:", Slippage_Uni);


  // console.log(
  //   "Uniswap Input:",
  //   ethers.formatEther(result.uniInput),
  //   "ETH",

  //   "Sushi Input:",
  //   ethers.formatEther(result.sushiInput),
  //   "ETH",

  //   "Total USDC Output:",
  //   ethers.formatUnits(result.bestOutput, 6)
  // );

  return {
    multiHopOutput: ethers.formatUnits(amountOut_MultiHop, 6),
    uniswap: {
      usdcWeth: ethers.formatUnits(uniAmountOut, 6),
      usdcOut: ethers.formatUnits(AmountOutUni, 6),
      spotPrice: spotPrice_Uni,
      executionPrice: executionPrice_Uni,
      slippage: Slippage_Uni,
      inputEth: ethers.formatEther(result.uniInput),
    },
    sushiswap: {
      usdcWeth: ethers.formatUnits(sushiAmountOut, 6),
      usdcOut: ethers.formatUnits(AmountOutSushi, 6),
      inputEth: ethers.formatEther(result.sushiInput),
    },
    totalUsdcOutput: ethers.formatUnits(result.bestOutput, 6),
  };
}