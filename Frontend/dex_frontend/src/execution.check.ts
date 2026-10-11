// Run: node src/execution.check.ts
import assert from "node:assert/strict";
import { buildTransactions, type ExecutionPlan } from "./execution.ts";
import { ROUTERS, TOKENS } from "./constants.ts";

const plan = (steps: ExecutionPlan["steps"], action = "SINGLE_SWAP"): ExecutionPlan => ({
  action, dex: "UNISWAP", input_eth: "1.5", steps,
});
const swap = (path: string[] = [TOKENS.WETH, TOKENS.USDC], minOut: unknown = 4000000000) => ({
  function: "swap_exact_eth_for_tokens",
  args: ["UNISWAP", 1500000000000000000, minOut, path],
});

// happy path: gas step skipped, amountIn taken from user input
const [tx] = buildTransactions(plan([{ function: "estimate_gas", args: [{}] }, swap()]), "1.5");
assert.deepEqual(tx, {
  kind: "swap", router: ROUTERS.UNISWAP, amountIn: 1500000000000000000n,
  minOut: 4000000000n, path: [TOKENS.WETH, TOKENS.USDC],
});

// lowercase addresses are accepted
assert.equal(buildTransactions(plan([swap([TOKENS.WETH.toLowerCase(), TOKENS.USDC])]), "1").length, 1);

// rejections
assert.throws(() => buildTransactions(plan([swap()], "ABORT"), "1"), /not executable/);
assert.throws(() => buildTransactions(plan([swap([TOKENS.WETH, "0x000000000000000000000000000000000000dEaD"])]), "1"), /Unknown token/);
assert.throws(() => buildTransactions(plan([swap([TOKENS.USDC, TOKENS.WETH])]), "1"), /start with WETH/);
assert.throws(() => buildTransactions(plan([swap(undefined, 1e30)]), "1"), /Invalid min_out/);
assert.throws(() => buildTransactions(plan([swap(undefined, 0)]), "1"), /positive/);
assert.throws(() => buildTransactions(plan([{ function: "approve_token", args: [TOKENS.USDC, "0x000000000000000000000000000000000000dEaD", 1] }, swap()]), "1"), /Unknown spender/);
assert.throws(() => buildTransactions(plan([{ function: "estimate_gas", args: [] }]), "1"), /no swap/);

console.log("execution plan checks passed");
