"use client";

import { useCallback, useState } from "react";
import { BaseError, ContractFunctionRevertedError, type Abi } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { addActivity, updateActivity } from "./activity";
import { toast } from "./toast";
import { EXPLORER } from "./wagmi";

export type FlowStatus = "idle" | "pending" | "success" | "error";

export interface TxStep {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  /** Human label shown in UI + activity log, e.g. "Approve USDC" */
  label: string;
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof BaseError) {
    // Dig past wagmi/viem's wrapper errors to find the actual require()
    // reason from the contract, e.g. "Target must exceed current tier",
    // instead of a generic "reverted on-chain" with no context.
    const revertError = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError && revertError.reason) {
      return revertError.reason;
    }
    return e.shortMessage || e.message || fallback;
  }
  if (e && typeof e === "object") {
    const withMsg = e as { shortMessage?: string; message?: string };
    return withMsg.shortMessage || withMsg.message || fallback;
  }
  return fallback;
}

/**
 * Runs a sequence of contract writes one after another, waiting for each to be
 * mined before starting the next (e.g. ERC20 approve -> the actual action).
 * Tracks progress, records every step to the activity log, and fires toasts.
 */
export function useTxFlow() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { address } = useAccount();

  const [status, setStatus] = useState<FlowStatus>("idle");
  const [stepLabel, setStepLabel] = useState<string>("");
  const [stepIndex, setStepIndex] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setStepLabel("");
    setStepIndex(0);
    setTotalSteps(0);
    setTxHash(undefined);
    setError(null);
  }, []);

  const run = useCallback(
    async (steps: TxStep[]) => {
      if (!address) {
        toast.error("Wallet not connected");
        return false;
      }
      setError(null);
      setStatus("pending");
      setTotalSteps(steps.length);

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        setStepIndex(i + 1);
        setStepLabel(step.label);

        // Pre-flight simulate so we surface the *real* revert reason (e.g. a
        // require() message) before ever asking the wallet to sign/spend gas,
        // instead of finding out only after it reverts on-chain.
        if (publicClient) {
          try {
            await publicClient.simulateContract({
              address: step.address,
              abi: step.abi,
              functionName: step.functionName,
              args: step.args,
              account: address,
            } as Parameters<typeof publicClient.simulateContract>[0]);
          } catch (e) {
            const msg = errorMessage(e, `${step.label} would fail`);
            setError(msg);
            setStatus("error");
            toast.error(`${step.label} would fail`, msg);
            return false;
          }
        }

        let hash: `0x${string}`;
        try {
          hash = await writeContractAsync({
            address: step.address,
            abi: step.abi,
            functionName: step.functionName,
            args: step.args,
          } as Parameters<typeof writeContractAsync>[0]);
        } catch (e) {
          const msg = errorMessage(e, `${step.label} failed`);
          setError(msg);
          setStatus("error");
          toast.error(`${step.label} failed`, msg);
          return false;
        }

        setTxHash(hash);
        const activityId = addActivity(address, {
          type: step.label,
          hash,
          status: "pending",
        });
        toast.info(`${step.label} submitted`, "Waiting for confirmation...", `${EXPLORER}/tx/${hash}`);

        try {
          const receipt = await publicClient!.waitForTransactionReceipt({ hash });
          if (receipt.status === "reverted") {
            updateActivity(activityId, { status: "failed" });
            // Re-simulate at the block right before the revert to recover the
            // real require() reason (the receipt itself carries no reason).
            let reason = "The transaction was reverted on-chain";
            try {
              await publicClient!.simulateContract({
                address: step.address,
                abi: step.abi,
                functionName: step.functionName,
                args: step.args,
                account: address,
                blockNumber: receipt.blockNumber - 1n,
              } as Parameters<NonNullable<typeof publicClient>["simulateContract"]>[0]);
            } catch (simErr) {
              reason = errorMessage(simErr, reason);
            }
            setError(`${step.label} reverted: ${reason}`);
            setStatus("error");
            toast.error(`${step.label} reverted`, reason, `${EXPLORER}/tx/${hash}`);
            return false;
          }
          updateActivity(activityId, { status: "confirmed" });
          toast.success(`${step.label} confirmed`, undefined, `${EXPLORER}/tx/${hash}`);
        } catch (e) {
          updateActivity(activityId, { status: "failed" });
          const msg = errorMessage(e, `${step.label} failed to confirm`);
          setError(msg);
          setStatus("error");
          toast.error(`${step.label} failed`, msg);
          return false;
        }
      }

      setStatus("success");
      return true;
    },
    [address, writeContractAsync, publicClient]
  );

  return { run, reset, status, stepLabel, stepIndex, totalSteps, txHash, error };
}
