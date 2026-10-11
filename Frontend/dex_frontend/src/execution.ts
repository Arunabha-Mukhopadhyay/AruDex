import { getAddress, parseEther, type Address } from "viem";
import { ROUTERS, TOKENS } from "./constants.ts";

export type PlannedTx =
  | { kind: "approve"; token: Address; spender: Address; amount: bigint }
  | { kind: "swap"; router: Address; amountIn: bigint; minOut: bigint; path: Address[] };

type Step = { function: string; args: unknown[] };
export type ExecutionPlan = { action: string; dex: string; input_eth: string; steps: Step[] };

const KNOWN_TOKENS = new Set(Object.values(TOKENS));
const KNOWN_ROUTERS = new Set(Object.values(ROUTERS));

// LLM output is untrusted: amounts may arrive as lossy JS numbers.
function toBigInt(value: unknown, label: string): bigint {
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  throw new Error(`Invalid ${label}: ${String(value)}`);
}

function knownAddress(value: unknown, allowed: Set<Address>, label: string): Address {
  const addr = getAddress(String(value));
  if (!allowed.has(addr)) throw new Error(`Unknown ${label} ${addr}`);
  return addr;
}

/**
 * Turn the Execution Agent's JSON blueprint into transactions, rejecting
 * anything that doesn't target a known router/token or doesn't match what
 * the user actually asked to trade.
 */
export function buildTransactions(plan: ExecutionPlan, userEth: string): PlannedTx[] {
  if (plan.action !== "SINGLE_SWAP" && plan.action !== "MULTI_HOP_SWAP") {
    throw new Error(`Plan is not executable (action=${plan.action})`);
  }
  const amountIn = parseEther(userEth);
  const txs: PlannedTx[] = [];

  for (const step of plan.steps) {
    if (step.function === "estimate_gas") continue; // wallet estimates gas itself

    if (step.function === "approve_token") {
      const [token, spender, amount] = step.args;
      txs.push({
        kind: "approve",
        token: knownAddress(token, KNOWN_TOKENS, "token"),
        spender: knownAddress(spender, KNOWN_ROUTERS, "spender"),
        amount: toBigInt(amount, "approve amount"),
      });
      continue;
    }

    if (step.function === "swap_exact_eth_for_tokens") {
      const [dex, , minOut, rawPath] = step.args;
      const router = ROUTERS[String(dex)];
      if (!router) throw new Error(`Unknown DEX ${String(dex)}`);
      if (!Array.isArray(rawPath) || rawPath.length < 2) throw new Error("Invalid swap path");
      const path = rawPath.map((t) => knownAddress(t, KNOWN_TOKENS, "token"));
      if (path[0] !== TOKENS.WETH) throw new Error("Swap path must start with WETH");
      const min = toBigInt(minOut, "min_out");
      if (min === 0n) throw new Error("min_out must be positive");
      // amount_in comes from the user's input, never from the LLM.
      txs.push({ kind: "swap", router, amountIn, minOut: min, path });
      continue;
    }

    throw new Error(`Unsupported step ${step.function}`);
  }

  if (!txs.some((t) => t.kind === "swap")) throw new Error("Plan has no swap step");
  return txs;
}
