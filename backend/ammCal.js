import { ethers } from "ethers";
import { routerAbi } from './factoryAbi.js'
import { PROVIDER_URL } from "./config.js";
// import { poolSushiSwap, readReserves, Weth_DAI_pool, DAI_USDC_pool } from "./pool.js";
// import { uni_eth_usdc_pool, sushi_eth_usdc_pool, Weth_Dai_pool, Dai_Usdc_pool, Weth_DAI_pool } from "./pool.js";
import { getAll_POOL_Logs } from './pool.js'

// const serializePoolLog = (label, pool) => {
//   if (!pool) {
//     return { label, error: "pool data unavailable" };
//   }

//   return {
//     label,
//     token0: pool.token0,
//     token1: pool.token1,
//     reserve0: pool.reserve0?.toString(),
//     reserve1: pool.reserve1?.toString(),
//     blockTimestampLast: pool.blockTimestampLast?.toString(),
//   };
// };

const PRIVATE_KEY = '0xea6c44ac03bff858b476bba40716402b03e41b8e97e276d1baec7c37d42484a0'

const UNISWAP_V2_ADDRESS_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const network = await provider.getNetwork();
console.log(network.chainId);

// const signer = new ethers.Wallet(process.env.PRIVATE_KEY,provider)
const signer = new ethers.Wallet(PRIVATE_KEY, provider)


async function estimateSwapGas(amountIn, minOut, path, wallet) {
  const router = new ethers.Contract(
    UNISWAP_V2_ADDRESS_ROUTER,
    routerAbi,
    signer
  );

  const deadline = Math.floor(Date.now() / 1000) + 60 * 5;

  const gas = await router.swapExactETHForTokens.estimateGas(
    minOut,
    path,
    wallet,
    deadline,
    { value: amountIn }
  );

  return gas;
}

async function executeSwap(amountIn, minOut, path, wallet) {
  const router = new ethers.Contract(
    UNISWAP_V2_ADDRESS_ROUTER,
    routerAbi,
    signer
  );

  const deadline = Math.floor(Date.now() / 1000) + 60 * 5;

  const tx = await router.swapExactETHForTokens(
    minOut,
    path,
    wallet,
    deadline,
    {
      value: amountIn,
      gasLimit: 300000 // safe buffer
    }
  );

  console.log("TX SENT:", tx.hash);
  const receipt = await tx.wait();
  console.log("TX CONFIRMED:", receipt.transactionHash);

  return receipt;
}


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

export { executeSwap, estimateSwapGas };


export const ammCalculation = async(req) => {
  // const amount = ethers.formatEther(1)
  // const oneEth = ethers.formatEther(20)


  const { amount, oneEth: oneEthStr } = req.body;
  const amountIn = ethers.parseEther(amount);
  const oneEth = ethers.parseEther(oneEthStr);

  // const uni = await uni_eth_usdc_pool();
  // const sushi = await sushi_eth_usdc_pool();
  // const dai = await Weth_DAI_pool();
  // const dai_usdc = await Dai_Usdc_pool();

  const poolLogs = await getAll_POOL_Logs()

  const uni = poolLogs.uniswapEthUsdc
  const sushi = poolLogs.sushiswapEthUsdc
  const dai = poolLogs.wethDai
  const dai_usdc = poolLogs.daiUsdc

  const uniReserve0 = BigInt(uni.reserve0);
  const uniReserve1 = BigInt(uni.reserve1);

  const sushiReserve0 = BigInt(sushi.reserve0);
  const sushiReserve1 = BigInt(sushi.reserve1);

  const daiReserve0 = BigInt(dai.reserve0);
  const daiReserve1 = BigInt(dai.reserve1);

  const daiUsdcReserve0 = BigInt(dai_usdc.reserve0);
  const daiUsdcReserve1 = BigInt(dai_usdc.reserve1);

  // const amountOut_MultiHop = await Multi_Hop(oneEth, dai, dai_usdc);
  const amountOut_MultiHop = await Multi_Hop(
    oneEth,
    { reserve0: daiReserve0, reserve1: daiReserve1 },
    { reserve0: daiUsdcReserve0, reserve1: daiUsdcReserve1 }
  );
  //console.log("Multi Hop Output:", ethers.formatUnits(amountOut_MultiHop, 6));


  const uniAmountOut = getAmountOut(amountIn, uniReserve1, uniReserve0);
  const sushiAmountOut = getAmountOut(amountIn, sushiReserve1, sushiReserve0);

  const AmountOutUni = simulateSwap(oneEth, uniReserve1, uniReserve0);
  const AmountOutSushi = simulateSwap(oneEth, sushiReserve1, sushiReserve0);


  const reserve0 = Number(ethers.formatUnits(uni.reserve0, 6));
  const reserve1 = Number(ethers.formatUnits(uni.reserve1, 18));

  const spotPrice_Uni = reserve0 / reserve1;
  const executionPrice_Uni = Number(ethers.formatUnits(uniAmountOut, 6)) / Number(amount);
  const Slippage_Uni = ((executionPrice_Uni - spotPrice_Uni) / spotPrice_Uni) * 100;  

  if (Slippage_Uni > 2) {
    throw new Error("Slippage too high");
  }

  const path = [uni.token1, uni.token0]
  const router = new ethers.Contract(UNISWAP_V2_ADDRESS_ROUTER,routerAbi,signer)
  const amounts = await router.getAmountsOut(oneEth, path);
  const expectedOut = amounts[amounts.length - 1];
  const minOut = AmountOutUni * 99n / 100n;

  const gasEstimation = await estimateSwapGas(oneEth, minOut, path, signer.address);
  // const spotPrice_Uni = ethers.formatUnits(uni.reserve0, 6) / ethers.formatUnits(uni.reserve1, 18);
  // const executionPrice_Uni = ethers.formatUnits(uniAmountOut, 6);
  // const Slippage_Uni = ((spotPrice_Uni - executionPrice_Uni) / spotPrice_Uni) * 100;

  // const result = binaryBestSplit(oneEth, uni, sushi);
  const result = binaryBestSplit(
    oneEth,
    { reserve0: uniReserve0, reserve1: uniReserve1 },
    { reserve0: sushiReserve0, reserve1: sushiReserve1 }
  );

  //compareing output of the two paths:
  const bestFinal = result.bestOutput > amountOut_MultiHop
    ? result.bestOutput
    : amountOut_MultiHop;

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

  // const poolLogs = {
  //   uniswapEthUsdc: serializePoolLog("UNISWAP_ETH_USDC", uni),
  //   sushiswapEthUsdc: serializePoolLog("SUSHISWAP_ETH_USDC", sushi),
  //   wethDai: serializePoolLog("UNISWAP_WETH_DAI", dai),
  //   daiUsdc: serializePoolLog("UNISWAP_DAI_USDC", dai_usdc),
  // };

  // const poolLogs = getAll_POOL_Logs()
  // console.log(poolLogs)

  const ammLogs = {
    multiHopOutput: ethers.formatUnits(amountOut_MultiHop, 6),
    uniswap: {
      usdcWeth: ethers.formatUnits(uniAmountOut, 6),
      usdcOut: ethers.formatUnits(AmountOutUni, 6),
      spotPrice: spotPrice_Uni,
      executionPrice: executionPrice_Uni,
      slippage: Slippage_Uni,
      inputEth: ethers.formatEther(result.uniInput),
      gasLimit: gasEstimation.toString()
    },
    sushiswap: {
      usdcWeth: ethers.formatUnits(sushiAmountOut, 6),
      usdcOut: ethers.formatUnits(AmountOutSushi, 6),
      inputEth: ethers.formatEther(result.sushiInput),
    },
    totalUsdcOutput: ethers.formatUnits(result.bestOutput, 6),
    bestOverall: ethers.formatUnits(bestFinal, 6)
  };
  return { poolLogs, ammLogs };
}


const mockReq = {
  body: {
    amount: "1",
    oneEth: "20"
  }
};

ammCalculation(mockReq)
  .then((res) => {
    console.log(
      JSON.stringify(res, (key, value) =>
        typeof value === "bigint" ? value.toString() : value,
        2)
    );
  })
  .catch((err) => {
    console.error("Error:", err);
  });