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

export async function readReserves() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const factory = new ethers.Contract(factory_address, factoryAbi, provider);

  const pairAddress = await factory.getPair(WETH, USDC);
  //console.log("Pair:", pairAddress);

  const pair = new ethers.Contract(pairAddress, pairAbi, provider);
  const [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
  console.log("Reserve0:", reserve0.toString());
  console.log("Reserve1:", reserve1.toString());
  console.log("Timestamp:", blockTimestampLast.toString());

  const token0 = await pair.token0();
  console.log("Token0_uniswap:", token0);
  const token1 = await pair.token1();
  console.log("Token1_uniswap:", token1);

  return{
    reserve0,
    reserve1,
    token0,
    token1,
    blockTimestampLast
  }
}
readReserves();


export async function poolSushiSwap(){
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const factory = new ethers.Contract(SushiSwap_FactoryAddress, factoryAbi, provider);

  const pairAddress = await factory.getPair(WETH, USDC);
  //console.log("Pair:", pairAddress);

  const pair = new ethers.Contract(pairAddress, pairAbi, provider);
  const [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
  //console.log("Reserve0:", reserve0.toString());
  //console.log("Reserve1:", reserve1.toString());
  //console.log("Timestamp:", blockTimestampLast.toString());

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
poolSushiSwap()