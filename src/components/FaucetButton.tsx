"use client";

import { useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { friendlyError } from "@/lib/errors";
import { notifyBalancesChanged } from "@/lib/ethereum";

type FaucetButtonProps = {
  /** compact = nav pill; full = wide primary button */
  variant?: "compact" | "full";
  className?: string;
};

/**
 * Drips GHOST / BOOK / SPARK for the connected wallet when balance &lt; 100.
 * Works for any user via /api/faucet (server mints with owner key).
 */
export default function FaucetButton({
  variant = "compact",
  className = "",
}: FaucetButtonProps) {
  const { isConnected, connect, address } = useWallet();
  const { showSuccess, showError, showInfo } = useToast();
  const [busy, setBusy] = useState(false);

  const drip = async () => {
    if (!isConnected || !address) {
      connect();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        dripped?: Array<{ symbol: string; minted: string }>;
        skipped?: Array<{ symbol: string; balanceBefore: string }>;
      };
      if (!res.ok) {
        throw new Error(data.error || "Faucet drip failed.");
      }

      notifyBalancesChanged({ address });

      if (data.dripped && data.dripped.length > 0) {
        showSuccess(data.message || "Faucet tokens sent.");
      } else {
        showInfo(
          data.message ||
            "Balances already ≥ 100. Open Swap and check Bal — if still 0, switch MetaMask to Coston2 (114)."
        );
      }
    } catch (err: unknown) {
      showError(friendlyError(err, "Faucet drip failed."));
    } finally {
      setBusy(false);
    }
  };

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={drip}
        disabled={busy}
        className={`w-full px-4 py-3.5 rounded-2xl bg-primary text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60 ${className}`}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
        {!isConnected
          ? "Connect to Get Faucet"
          : busy
            ? "Dripping 👻 · 📖 · ⚡…"
            : "Get Faucet Tokens"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={drip}
      disabled={busy}
      title="Drip 👻 GHOST, 📖 BOOK, ⚡ SPARK if balance < 100"
      className={`h-9 px-3 rounded-full text-xs sm:text-sm font-semibold bg-primary/15 text-primary border border-primary/25 hover:bg-primary hover:text-white transition-colors inline-flex items-center gap-1.5 disabled:opacity-60 ${className}`}
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Coins className="w-3.5 h-3.5" />
      )}
      <span className="hidden sm:inline">{busy ? "Dripping…" : "Faucet"}</span>
    </button>
  );
}
