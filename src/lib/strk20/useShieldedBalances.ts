"use client";

/**
 * Shielded balances, shared by the balance page and the order builder.
 *
 * The order builder needs these to stop a user committing a plan they can't fund: the terms are
 * enforced on-chain, so an unfundable plan doesn't fail politely — the fill reverts.
 */

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { parseShieldedBalances, type ShieldedBalance } from "@/lib/strk20/actions";

export function useShieldedBalances() {
  const { walletAccount } = useWallet();
  const [balances, setBalances] = useState<ShieldedBalance[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!walletAccount) {
      setBalances(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setBalances(parseShieldedBalances(await walletAccount.strk20Balances([])));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [walletAccount]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Shielded amount of one token, in its smallest unit. */
  const balanceOf = useCallback(
    (token: string): bigint => {
      if (!balances) return 0n;
      try {
        const target = BigInt(token);
        return balances.find((b) => BigInt(b.token) === target)?.amount ?? 0n;
      } catch {
        return 0n;
      }
    },
    [balances],
  );

  const hasAnything = Boolean(balances?.some((b) => b.amount > 0n));

  return { balances, balanceOf, hasAnything, loading, error, refresh };
}
