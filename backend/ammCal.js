import { ethers } from "ethers";
// import { poolSushiSwap, readReserves, Weth_DAI_pool, DAI_USDC_pool } from "./pool.js";
import { uni_eth_usdc_pool , sushi_eth_usdc_pool, Weth_Dai_pool, Dai_Usdc_pool, Weth_DAI_pool } from "./pool.js";

function getAmountOut(amountIn, reserveIn, reserveOut) {
  return  (reserveOut * amountIn * 997n) / (reserveIn * 1000n + amountIn * 997n)
}

function simulateSwap(amountIn,reserveIn, reserveOut) {
  return (reserveOut * amountIn * 997n) / (reserveIn * 1000n + amountIn * 997n)
}

async function Multi_Hop(amountIn,pool1,pool2){
  const amountOut_1 = simulateSwap(amountIn,pool1.reserve1,pool1.reserve0);
  const amountOut_2 = simulateSwap(amountOut_1,pool2.reserve0,pool2.reserve1);
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


async function ammCalculation() {
  const amountIn = ethers.parseEther('1'); // 1 ETH for single-pool quote
  const oneEth = 20n * 10n ** 18n; // 20 ETH for split + multihop demo
  const uni = await uni_eth_usdc_pool();
  const sushi = await sushi_eth_usdc_pool();

  const dai = await Weth_DAI_pool();
  const dai_usdc = await Dai_Usdc_pool();

  const amountOut_MultiHop = await Multi_Hop(oneEth,dai,dai_usdc);

  const uniAmountOut = getAmountOut(amountIn, uni.reserve1, uni.reserve0);
  const sushiAmountOut = getAmountOut(amountIn, sushi.reserve1, sushi.reserve0);

  const AmountOutUni = simulateSwap(oneEth, uni.reserve1, uni.reserve0);
  const AmountOutSushi = simulateSwap(oneEth, sushi.reserve1, sushi.reserve0);

  const spotPrice_Uni = ethers.formatUnits(uni.reserve0,6) / ethers.formatUnits(uni.reserve1,18);

  const executionPrice_Uni = ethers.formatUnits(uniAmountOut, 6);
  const Slippage_Uni = ((spotPrice_Uni - executionPrice_Uni) / spotPrice_Uni) * 100;

  const result = binaryBestSplit(oneEth, uni, sushi);

  return {
    inputs: {
      singleQuoteEth: "1",
      splitAndMultiHopEth: "20",
    },
    multiHop: {
      path: "WETH -> DAI -> USDC",
      outputUsdc: ethers.formatUnits(amountOut_MultiHop, 6),
    },
    directQuotes: {
      uniswap_outUsdc_for1Eth: ethers.formatUnits(uniAmountOut, 6),
      sushiswap_outUsdc_for1Eth: ethers.formatUnits(sushiAmountOut, 6),
    },
    execution: {
      uniswap_outUsdc_for20Eth: ethers.formatUnits(AmountOutUni, 6),
      sushiswap_outUsdc_for20Eth: ethers.formatUnits(AmountOutSushi, 6),
      spotPrice_uniswap_usdcPerEth: spotPrice_Uni,
      executionPrice_uniswap_usdcFor1Eth: executionPrice_Uni,
      slippage_uniswap_percent_for1Eth: Slippage_Uni,
    },
    bestSplit: {
      uniswapInputEth: ethers.formatEther(result.uniInput),
      sushiswapInputEth: ethers.formatEther(result.sushiInput),
      totalOutputUsdc: ethers.formatUnits(result.bestOutput, 6),
    },
  };
}

export async function runAmmCalculation() {
  return ammCalculation();
}

// CLI mode (keeps your current behavior if you run `node ammCal.js`)
if (import.meta.url === `file://${process.argv[1]}`) {
  ammCalculation()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
}