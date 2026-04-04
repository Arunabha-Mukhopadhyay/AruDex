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

const PRIVATE_KEY = '0xde9be858da4a475276426320d5e9262ecfc3ba460bfac56360bfa6c4c28b4ee0'

const UNISWAP_V2_ADDRESS_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
const SUSHISWAP_ADDRESS_ROUTER = '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F'
const provider = new ethers.JsonRpcProvider(PROVIDER_URL);

//const network = await provider.getNetwork();
//console.log(network.chainId);

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



async function estimateSushiSwapGas(amountIn, minOut, path, wallet) {
  const router = new ethers.Contract(
    SUSHISWAP_ADDRESS_ROUTER,
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

async function executeSushiSwap(amountIn, minOut, path, wallet) {
  const router = new ethers.Contract(
    SUSHISWAP_ADDRESS_ROUTER,
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




// function getAmountOut(amountIn, reserveIn, reserveOut) {
//   return (reserveOut * amountIn * 997n) / (reserveIn * 1000n + amountIn * 997n)
// }

function simulateSwap(amountIn, reserveIn, reserveOut) {
  return (reserveOut * amountIn * 997n) / (reserveIn * 1000n + amountIn * 997n)
}

function getAmountIn(amountOut, reserveIn, reserveOut) {
  return (reserveIn * amountOut * 1000n) / ((reserveOut - amountOut) * 997n) + 1n;
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

export { executeSwap, estimateSwapGas, executeSushiSwap, estimateSushiSwapGas };


export const ammCalculation = async(req) => {
  // const amount = ethers.formatEther(1)
  // const oneEth = ethers.formatEther(20)

  // const { amount, oneEth: oneEthStr } = req.body;
  // const amountIn = ethers.parseEther(amount);

  if (!req?.body?.oneEth) {
    throw new Error("oneEth is required");
  }

  const oneEthStr = req.body.oneEth;
  const oneEth = ethers.parseEther(oneEthStr);

  //FOR SIMULATION OUTPUT:
  const amountInArb = 1000n * 10n ** 6n; // 1000 USDC


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
  let amountOut_MultiHop = 0n;

  if (!dai.isStale && !dai_usdc.isStale) {
    amountOut_MultiHop = await Multi_Hop(
      oneEth,
      { reserve0: daiReserve0, reserve1: daiReserve1 },
      { reserve0: daiUsdcReserve0, reserve1: daiUsdcReserve1 }
    );
  } else {
    console.log("Skipping multi-hop: stale pool detected");
  }
  // const amountOut_MultiHop = await Multi_Hop(
  //   oneEth,
  //   { reserve0: daiReserve0, reserve1: daiReserve1 },
  //   { reserve0: daiUsdcReserve0, reserve1: daiUsdcReserve1 }
  // );
  //console.log("Multi Hop Output:", ethers.formatUnits(amountOut_MultiHop, 6));



  // const uniAmountOut = getAmountOut(amountIn, uniReserve1, uniReserve0);
  // const sushiAmountOut = getAmountOut(amountIn, sushiReserve1, sushiReserve0);

  const AmountOutUni = simulateSwap(oneEth, uniReserve1, uniReserve0);
  const AmountOutSushi = simulateSwap(oneEth, sushiReserve1, sushiReserve0);

  let result;
  if (sushi.isStale) {
    console.log("Skipping split: Sushi pool is stale");
    result = {
      uniInput: oneEth,
      sushiInput: 0n,
      bestOutput: AmountOutUni
    };
  } else {
    result = binaryBestSplit(
      oneEth,
      { reserve0: uniReserve0, reserve1: uniReserve1 },
      { reserve0: sushiReserve0, reserve1: sushiReserve1 }
    );
  }

  let bestFinal = result.bestOutput;
  if (amountOut_MultiHop > 0n && amountOut_MultiHop > result.bestOutput) {
    bestFinal = amountOut_MultiHop;
  }

  const optimizedInputEth = sushi.isStale ? oneEth : result.uniInput;

  const reserve0 = Number(ethers.formatUnits(uni.reserve0, 6));
  const reserve1 = Number(ethers.formatUnits(uni.reserve1, 18));

  const spotPrice_Uni = reserve0 / reserve1;
  const executionPrice_Uni = Number(ethers.formatUnits(simulateSwap(optimizedInputEth, uniReserve1, uniReserve0), 6)) / Number(ethers.formatEther(optimizedInputEth));
  const Slippage_Uni = ((executionPrice_Uni - spotPrice_Uni) / spotPrice_Uni) * 100; 

  if (Math.abs(Slippage_Uni) > 2) {
    throw new Error("Slippage too high");
  }


  // const path = [uni.token1, uni.token0]
  const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const isWethToken0 = uni.token0.toLowerCase() === WETH_ADDRESS.toLowerCase();

  const path = isWethToken0
    ? [uni.token0, uni.token1]
    : [uni.token1, uni.token0];
  const router = new ethers.Contract(UNISWAP_V2_ADDRESS_ROUTER,routerAbi,signer)
  const amounts = await router.getAmountsOut(optimizedInputEth, path);
  //const expectedOutOptimized = simulateSwap(optimizedInputEth,uniReserve1,uniReserve0);
  const expectedOut = amounts[amounts.length - 1];
  const minOut = expectedOut * 99n / 100n;
  // const minOut = AmountOutUni * 99n / 100n;


  
  //const gasEstimation = await estimateSwapGas(oneEth, minOut, path, signer.address);
  const gasEstimation = await estimateSwapGas(
    optimizedInputEth,
    minOut,
    path,
    signer.address
  );


  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice;
  const estimatedGasCost = gasEstimation * gasPrice;
  const gasCostEth = ethers.formatEther(estimatedGasCost);
  const gas_cost_usdc = Number(gasCostEth) * executionPrice_Uni;
  const effectiveOutput = Number(ethers.formatUnits(AmountOutUni, 6)) - gas_cost_usdc;



  let spotPrice_Sushi = 0;
  let executionPrice_Sushi = 0;
  let Slippage_Sushi = 0;
  let gasEstimation_sushi = 0n;
  let gas_cost_usdc_sushi = 0;
  let effectiveOutput_sushi = 0;

  

  if(!sushi.isStale){
    const Sushi_reserve0 = Number(ethers.formatUnits(sushi.reserve0, 6));
    const Sushi_reserve1 = Number(ethers.formatUnits(sushi.reserve1, 18));

    spotPrice_Sushi = Sushi_reserve0 / Sushi_reserve1;
    executionPrice_Sushi = Number(ethers.formatUnits(simulateSwap(oneEth, sushiReserve1, sushiReserve0), 6)) / Number(ethers.formatEther(oneEth));
    Slippage_Sushi = ((executionPrice_Sushi - spotPrice_Sushi) / spotPrice_Sushi) * 100;


    if (Math.abs(Slippage_Sushi) > 2) {
      throw new Error("Slippage too high for SushiSwap");
    }

    const isWethToken0_sushi = sushi.token0.toLowerCase() === WETH_ADDRESS.toLowerCase();
    const path_sushi = isWethToken0_sushi ? [sushi.token0, sushi.token1] : [sushi.token1, sushi.token0];
    const router_sushi = new ethers.Contract(SUSHISWAP_ADDRESS_ROUTER, routerAbi, signer)
    const amounts_SUSHI = await router_sushi.getAmountsOut(oneEth, path_sushi);
    //const expectedOutOptimized = simulateSwap(optimizedInputEth,uniReserve1,uniReserve0);
    const expectedOut_sushi = amounts_SUSHI[amounts_SUSHI.length - 1];
    const minOut_sushi = expectedOut_sushi * 99n / 100n;

    gasEstimation_sushi = await estimateSushiSwapGas(
      oneEth,
      minOut_sushi,
      path_sushi,
      signer.address
    );

    const feeData_sushi = await provider.getFeeData();
    const gasPrice_sushi = feeData_sushi.gasPrice;
    const estimatedGasCost_sushi = gasEstimation_sushi * gasPrice_sushi;
    const gasCostEth_sushi = ethers.formatEther(estimatedGasCost_sushi);
    gas_cost_usdc_sushi = Number(gasCostEth_sushi) * executionPrice_Sushi;
    effectiveOutput_sushi = Number(ethers.formatUnits(AmountOutSushi, 6)) - gas_cost_usdc_sushi;
  } else{
    console.log("Skipping SushiSwap calculations as it is stale pool");
  }
  
  // const path = [uni.token1, uni.token0]
  // const minOut = AmountOutUni * 99n / 100n;
  //const gasEstimation = await estimateSwapGas(oneEth, minOut, path, signer.address);

  const bestEffective = sushi.isStale ? Number(effectiveOutput) : Math.max(Number(effectiveOutput), Number(effectiveOutput_sushi));

  if (Math.abs(spotPrice_Uni - spotPrice_Sushi) < 0.5) {
    console.log("No meaningful arbitrage opportunity");
  }

  // ARBITRAGE CALCULATION:
  function Arbitrage_opp(uni, sushi, amountIn){
    const eth_uni = simulateSwap(amountIn, uni.reserve0, uni.reserve1);
    const usdc_sushi = simulateSwap(eth_uni, sushi.reserve1, sushi.reserve0);
    const profit  = usdc_sushi - amountIn; 

    const eth_sushi = simulateSwap(amountIn, sushi.reserve0, sushi.reserve1);
    const usdc_uni = simulateSwap(eth_sushi, uni.reserve1, uni.reserve0);
    const profit2 = usdc_uni - amountIn;

    return {
      uni_to_sushi:{
        finalOutput: usdc_sushi,
        profit: profit
      },
      sushi_to_uni: {
        finalOutput: usdc_uni,
        profit: profit2
      }
    }
  }


  let arb = null;
  let netProfitUniToSushi = 0;
  let netProfitSushiToUni = 0;

  if (!uni.isStale && !sushi.isStale) {
    arb = Arbitrage_opp(
      { reserve0: uniReserve0, reserve1: uniReserve1 },
      { reserve0: sushiReserve0, reserve1: sushiReserve1 },
      amountInArb
    );

    const arbEthAmount = simulateSwap(amountInArb, uniReserve0, uniReserve1);

    let arbGasCostUSDC = 0;

    try {
      const arbPath = isWethToken0
        ? [uni.token0, uni.token1]
        : [uni.token1, uni.token0];

      const arbMinOut = 0n;

      const arbGasEstimate = await estimateSwapGas(
        arbEthAmount,
        arbMinOut,
        arbPath,
        signer.address
      );

      const feeDataArb = await provider.getFeeData();
      const gasCostEthArb =
        arbGasEstimate * feeDataArb.gasPrice;

      const gasEthFormatted = Number(ethers.formatEther(gasCostEthArb));

      arbGasCostUSDC = gasEthFormatted * executionPrice_Uni * 2; // 2 swaps
    } catch (err) {
      console.log("Arb gas estimation failed, using fallback");
      arbGasCostUSDC = 10; // fallback safety
    }

    netProfitUniToSushi =
      Number(ethers.formatUnits(arb.uni_to_sushi.profit, 6)) -
      arbGasCostUSDC;

    netProfitSushiToUni =
      Number(ethers.formatUnits(arb.sushi_to_uni.profit, 6)) -
      arbGasCostUSDC;
  }
  // const spotPrice_Uni = ethers.formatUnits(uni.reserve0, 6) / ethers.formatUnits(uni.reserve1, 18);
  // const executionPrice_Uni = ethers.formatUnits(uniAmountOut, 6);
  // const Slippage_Uni = ((spotPrice_Uni - executionPrice_Uni) / spotPrice_Uni) * 100;


  // const result = binaryBestSplit(oneEth, uni, sushi);

  // const result = binaryBestSplit(
  //   oneEth,
  //   { reserve0: uniReserve0, reserve1: uniReserve1 },
  //   { reserve0: sushiReserve0, reserve1: sushiReserve1 }
  // );

  // const bestFinal = result.bestOutput > amountOut_MultiHop
  //   ? result.bestOutput
  //   : amountOut_MultiHop;



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
      usdcOutRaw: AmountOutUni.toString(), 
      //usdcWeth: ethers.formatUnits(uniAmountOut, 6),
      usdcOut: ethers.formatUnits(AmountOutUni, 6),
      spotPrice: spotPrice_Uni,
      executionPrice: executionPrice_Uni,
      slippage: Slippage_Uni,
      optimizedInputEth: ethers.formatEther(optimizedInputEth),
      gasLimit: gasEstimation.toString(),
      gas_cost_usdc: gas_cost_usdc.toFixed(6),
      effectiveOutput: effectiveOutput.toFixed(6),
    },
    sushiswap: {
      usdcOutRaw: AmountOutSushi.toString(),
      //usdcWeth: ethers.formatUnits(sushiAmountOut, 6),
      usdcOut: ethers.formatUnits(AmountOutSushi, 6),
      optimizedInputEth: ethers.formatEther(result.sushiInput),
      spotPrice: spotPrice_Sushi,
      executionPrice: executionPrice_Sushi,
      slippage: Slippage_Sushi,
      gasLimit: gasEstimation_sushi.toString(),
      gas_cost_usdc: gas_cost_usdc_sushi.toFixed(6),
      effectiveOutput: effectiveOutput_sushi.toFixed(6)
    },
    totalUsdcOutputRaw: result.bestOutput.toString(), 
    totalUsdcOutput: ethers.formatUnits(result.bestOutput, 6),
    totalEffectiveOutput: Math.max(effectiveOutput, effectiveOutput_sushi).toFixed(6),
  
    arb: arb ? {
      uni_to_sushi: {
        profit: ethers.formatUnits(arb.uni_to_sushi.profit, 6),
        netProfit: netProfitUniToSushi.toFixed(6)
      },
      sushi_to_uni: {
        profit: ethers.formatUnits(arb.sushi_to_uni.profit, 6),
        netProfit: netProfitSushiToUni.toFixed(6)
      }
    } : {
      message: "Arbitrage skipped (stale pool)"
    },
    bestOverall: bestEffective.toFixed(6)
  };
  return { poolLogs, ammLogs };
}


const mockReq = {
  body: {
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



  // MEV PROTECTION:
  //ARBITRAGE BOT: