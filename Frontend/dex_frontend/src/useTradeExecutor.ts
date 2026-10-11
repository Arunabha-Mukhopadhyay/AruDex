import { useState } from "react";
import { erc20Abi, type Hash } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { config } from "./Config";
import { routerAbi } from "./constants.ts";
import { buildTransactions, type ExecutionPlan } from "./execution.ts";

const DEADLINE_SECONDS = 20 * 60;

export function useTradeExecutor() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [hashes, setHashes] = useState<Hash[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const execute = async (plan: ExecutionPlan, userEth: string) => {
    setHashes([]);
    setError(null);
    setRunning(true);
    try {
      if (!address) throw new Error("Connect your wallet first");
      const txs = buildTransactions(plan, userEth);

      // Sequential: each step must be mined before the next popup.
      for (const [i, tx] of txs.entries()) {
        setStatus(`Step ${i + 1}/${txs.length}: confirm ${tx.kind} in MetaMask…`);
        const hash =
          tx.kind === "approve"
            ? await writeContractAsync({
                address: tx.token,
                abi: erc20Abi,
                functionName: "approve",
                args: [tx.spender, tx.amount],
              })
            : await writeContractAsync({
                address: tx.router,
                abi: routerAbi,
                functionName: "swapExactETHForTokens",
                args: [tx.minOut, tx.path, address, BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)],
                value: tx.amountIn,
              });
        setHashes((prev) => [...prev, hash]);

        setStatus(`Step ${i + 1}/${txs.length}: waiting for confirmation…`);
        const receipt = await waitForTransactionReceipt(config, { hash });
        if (receipt.status !== "success") throw new Error(`Transaction ${hash} reverted`);
      }
      setStatus("Trade executed successfully");
    } catch (err: unknown) {
      setStatus(null);
      setError(err instanceof Error ? err.message.split("\n")[0] : "Execution failed");
    } finally {
      setRunning(false);
    }
  };

  return { execute, hashes, status, error, running };
}
