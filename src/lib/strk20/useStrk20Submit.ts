"use client";

/**
 * Submitting STRK20 actions and waiting for the receipt.
 *
 * Privacy-pool transactions verify a STARK proof on-chain and are relayed, so confirmation takes
 * noticeably longer than a normal call — hence the long retry budget. The sender on-chain is a
 * shared relayer, never the user.
 */

import { useCallback, useState } from "react";
import type { WALLET_API } from "@starknet-io/types-js";
import { useWallet } from "@/context/WalletContext";
import { providerFor } from "@/lib/starknet/config";

export type SubmitStatus = "idle" | "signing" | "pending" | "success" | "error";

export type SubmitResult = {
  status: SubmitStatus;
  txHash: string | null;
  receipt: unknown | null;
  error: string | null;
};

const INITIAL: SubmitResult = { status: "idle", txHash: null, receipt: null, error: null };

export function useStrk20Submit() {
  const { walletAccount, network } = useWallet();
  const [result, setResult] = useState<SubmitResult>(INITIAL);

  const reset = useCallback(() => setResult(INITIAL), []);

  const submit = useCallback(
    async (actions: WALLET_API.STRK20_ACTION[]): Promise<SubmitResult> => {
      if (!walletAccount) {
        const failed = { ...INITIAL, status: "error" as const, error: "Connect a wallet first." };
        setResult(failed);
        return failed;
      }

      setResult({ ...INITIAL, status: "signing" });
      let txHash: string;
      try {
        const response = await walletAccount.strk20InvokeTransaction(actions);
        txHash = response.transaction_hash;
      } catch (err) {
        const failed = {
          ...INITIAL,
          status: "error" as const,
          error: err instanceof Error ? err.message : String(err),
        };
        setResult(failed);
        return failed;
      }

      setResult({ status: "pending", txHash, receipt: null, error: null });
      try {
        const receipt = await providerFor(network).waitForTransaction(txHash, {
          retries: 400,
          retryInterval: 3000,
        });
        const reverted =
          (receipt as { execution_status?: string })?.execution_status === "REVERTED";
        const done: SubmitResult = {
          status: reverted ? "error" : "success",
          txHash,
          receipt,
          error: reverted ? "Transaction reverted on-chain." : null,
        };
        setResult(done);
        return done;
      } catch (err) {
        const failed: SubmitResult = {
          status: "error",
          txHash,
          receipt: null,
          error: err instanceof Error ? err.message : String(err),
        };
        setResult(failed);
        return failed;
      }
    },
    [walletAccount, network],
  );

  return { ...result, submit, reset, isBusy: result.status === "signing" || result.status === "pending" };
}
