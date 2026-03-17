import { ethers } from "ethers";
import { PROVIDER_URL } from "./config.js";
import { factoryAbi } from "./factoryAbi.js";
import { pairAbi } from "./pairAbi.js";
import dotenv from "dotenv";
dotenv.config();

//RPC_URL = process.env.ALCHEMY_RPC_URL;
const RPC_URL = PROVIDER_URL;
const factory_address = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'

const SushiSwap_FactoryAddress = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac"

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F'


async function poolReserves(FactoryAddress, Token0, Token1){
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const factory = new ethers.Contract(FactoryAddress,factoryAbi,provider);

  const pairAddress = await factory.getPair(Token0, Token1);
  console.log("Pair:", pairAddress);

  const pair = new ethers.Contract(pairAddress, pairAbi, provider);
  const [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
  // console.log("Reserve0:", ethers.formatUnits(reserve0,6));
  // console.log("Reserve1:", ethers.formatEther(reserve1));
  // console.log("Timestamp:", blockTimestampLast.toString());

  const token0 = await pair.token0();
  //console.log("Token0:", token0);
  const token1 = await pair.token1();
  //console.log("Token1:", token1);


  const getDecimals = (token) => {
    if (token === USDC) return 6;
    return 18; 
  };

  console.log(
    "Reserve0:",
    ethers.formatUnits(reserve0, getDecimals(token0)),
    "| token0:",
    token0
  );

  console.log(
    "Reserve1:",
    ethers.formatUnits(reserve1, getDecimals(token1)),
    "| token1:",
    token1
  );

  console.log("Timestamp:", blockTimestampLast.toString());

  return{
    reserve0,
    reserve1,
    token0,
    token1,
    blockTimestampLast
  }
}


export async function uni_eth_usdc_pool(){
  return poolReserves(factory_address, WETH, USDC)
} 
uni_eth_usdc_pool()

export async function sushi_eth_usdc_pool(){
  return poolReserves(SushiSwap_FactoryAddress, WETH, USDC)
}
sushi_eth_usdc_pool()

export async function Weth_Dai_pool(){
  return poolReserves(factory_address, WETH, DAI)
}

export async function Dai_Usdc_pool(){
  return poolReserves(factory_address, DAI, USDC)
}

Weth_Dai_pool()
Dai_Usdc_pool()



// for testting purpose and understanding the pool reserves logs:
export async function readReserves() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const factory = new ethers.Contract(factory_address, factoryAbi, provider);

  const pairAddress = await factory.getPair(WETH, USDC);
  //console.log("Pair:", pairAddress);

  const pair = new ethers.Contract(pairAddress, pairAbi, provider);
  const [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
  //console.log("Reserve0_uniswap:", reserve0.toString());
  //console.log("Reserve1_uniswap:", reserve1.toString());
  //console.log("Timestamp_uniswap:", blockTimestampLast.toString());

  const token0 = await pair.token0();
  //console.log("Token0_uniswap:", token0);
  const token1 = await pair.token1();
  //console.log("Token1_uniswap:", token1);

  return{
    reserve0,
    reserve1,
    token0,
    token1,
    blockTimestampLast
  }
}
//readReserves();


export async function poolSushiSwap(){
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const factory = new ethers.Contract(SushiSwap_FactoryAddress, factoryAbi, provider);

  const pairAddress = await factory.getPair(WETH, USDC);
  //console.log("Pair:", pairAddress);

  const pair = new ethers.Contract(pairAddress, pairAbi, provider);
  const [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
  //console.log("Reserve0_sushi:", reserve0.toString());
  //console.log("Reserve1_sushi:", reserve1.toString());
  //console.log("Timestamp_sushi:", blockTimestampLast.toString());

  const token0 = await pair.token0();
  //console.log("Token0_sushi:", token0);
  const token1 = await pair.token1();
  //console.log("Token1_sushi:", token1);

  return{
    reserve0,
    reserve1,
    token0,
    token1,
    blockTimestampLast
  }
}
//poolSushiSwap()


export async function DAI_USDC_pool() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  //console.log(factory_address)
  const factory = new ethers.Contract(factory_address, factoryAbi, provider);

  const pairAddress = await factory.getPair(DAI, USDC);
  console.log("Pair:", pairAddress);

  const pair = new ethers.Contract(pairAddress, pairAbi, provider);
  const [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
  console.log("Reserve0_DAI->USDC:", ethers.formatUnits(reserve0,18));
  console.log("Reserve1_DAI->USDC:", ethers.formatUnits(reserve1,6));
  console.log("Timestamp_DAI->USDC:", blockTimestampLast.toString());

  const token0 = await pair.token0();
  console.log("Token0_DAI->USDC:", token0);
  const token1 = await pair.token1();
  console.log("Token1_DAI->USDC:", token1);

  return {
    reserve0,
    reserve1,
    token0,
    token1,
    blockTimestampLast
  }
}
//DAI_USDC_pool()


export async function Weth_DAI_pool(){
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  //console.log(factory_address)
  const factory = new ethers.Contract(factory_address, factoryAbi, provider);

  const pairAddress = await factory.getPair(WETH, DAI);
  console.log("Pair:", pairAddress);

  const pair = new ethers.Contract(pairAddress, pairAbi, provider);
  const [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
  console.log("Reserve0_weth->dai:", ethers.formatUnits(reserve0,18));
  console.log("Reserve1_weth->dai:", ethers.formatUnits(reserve1,18));
  console.log("Timestamp_weth->dai:", blockTimestampLast.toString());

  const token0 = await pair.token0();
  console.log("Token0_weth->dai:", token0);
  const token1 = await pair.token1();
  console.log("Token1_weth->dai:", token1);

  return{
    reserve0,
    reserve1,
    token0,
    token1,
    blockTimestampLast
  }
}
//Weth_DAI_pool()