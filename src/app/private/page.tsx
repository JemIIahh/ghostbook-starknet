"use client";

/**
 * Balance — move value in and out of the privacy pool.
 *
 * Three actions with very different privacy properties, so each one states plainly what it exposes
 * before you use it. All three are executed by the wallet through the STRK20 wallet API; this app
 * never touches a viewing key.
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import GhostPageShell from "@/components/GhostPageShell";
import ConnectButton from "@/components/wallet/ConnectButton";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { explorerTxUrl, TOKENS, tokenByAddress } from "@/lib/starknet/config";
import {
  privateTransferActions,
  shieldActions,
  unshieldActions,
} from "@/lib/strk20/actions";
import { useStrk20Submit } from "@/lib/strk20/useStrk20Submit";
import { useShieldedBalances } from "@/lib/strk20/useShieldedBalances";
import { fromSmallestUnit, toSmallestUnit } from "@/lib/strk20/plan";
import { friendlyError } from "@/lib/errors";
import { formatToken, shortHex } from "@/lib/format";

type Tab = "shield" | "transfer" | "unshield";

const TABS: Array<{
  key: Tab;
  label: string;
  icon: typeof ArrowDownToLine;
  cta: string;
  sub: string;
  exposes: string;
}> = [
  {
    key: "shield",
    label: "Add",
    icon: ArrowDownToLine,
    cta: "Add to private balance",
    sub: "Move tokens from your wallet into the privacy pool so you can trade privately.",
    exposes: "Anyone can see your address, the token and the amount you add. That's unavoidable — privacy starts after this step.",
  },
  {
    key: "transfer",
    label: "Send",
    icon: Send,
    cta: "Send privately",
    sub: "Send to another Starknet address without leaving the pool.",
    exposes: "Nobody can see the amount or who the parties are. This is the strongest privacy the pool offers.",
  },
  {
    key: "unshield",
    label: "Withdraw",
    icon: ArrowUpFromLine,
    cta: "Withdraw to wallet",
    sub: "Take tokens back out to a normal Starknet address.",
    exposes: "The destination and amount are visible, but not which deposit they came from.",
  },
];

export default function BalancePage() {
  const { isConnected, address, network, isSupportedNetwork } = useWallet();
  const { showSuccess, showError, showInfo } = useToast();
  const { submit, isBusy, status, txHash } = useStrk20Submit();
  const { balances, balanceOf, loading, refresh } = useShieldedBalances();

  const [tab, setTab] = useState<Tab>("shield");
  const [tokenAddress, setTokenAddress] = useState(TOKENS[0].address);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");

  const token = useMemo(() => tokenByAddress(tokenAddress) ?? TOKENS[0], [tokenAddress]);
  const active = TABS.find((t) => t.key === tab)!;
  const available = fromSmallestUnit(balanceOf(token.address), token.decimals);
  const spending = tab !== "shield";
  const overspending = spending && Number(amount) > available;

  // Clear the form when switching action, so an amount typed for one doesn't carry into another.
  useEffect(() => {
    setAmount("");
  }, [tab]);

  const run = async () => {
    if (!address) return;
    let parsed: bigint;
    try {
      parsed = toSmallestUnit(Number(amount), token.decimals);
    } catch {
      showError("Enter a valid amount.");
      return;
    }
    if (parsed <= 0n) {
      showError("Enter an amount greater than zero.");
      return;
    }
    if (overspending) {
      showError(`You only have ${formatToken(available)} ${token.symbol} in your private balance.`);
      return;
    }

    const to = recipient.trim() || address;
    if (spending) {
      try {
        BigInt(to);
      } catch {
        showError("That doesn't look like a Starknet address.");
        return;
      }
    }

    const actions =
      tab === "shield"
        ? shieldActions(token.address, parsed)
        : tab === "transfer"
          ? privateTransferActions(token.address, parsed, to)
          : unshieldActions(token.address, parsed, to);

    showInfo("Confirm in your wallet — proving takes a moment.");
    const result = await submit(actions);
    if (result.status === "success") {
      showSuccess(
        tab === "shield"
          ? `Added ${formatToken(Number(amount))} ${token.symbol} to your private balance.`
          : tab === "transfer"
            ? `Sent ${formatToken(Number(amount))} ${token.symbol} privately.`
            : `Withdrew ${formatToken(Number(amount))} ${token.symbol}.`,
      );
      setAmount("");
      void refresh();
    } else if (result.error) {
      showError(friendlyError(result.error));
    }
  };

  return (
    <GhostPageShell
      eyebrow="Balance"
      title="Your private balance"
      subtitle="The pool holds your tokens as encrypted notes. Add to it, send from it, or withdraw back to a normal address."
      maxWidth="lg"
      headerRight={
        isConnected ? (
          <button onClick={() => void refresh()} disabled={loading} className="btn btn-ghost !py-2 !px-3.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        ) : null
      }
    >
      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-4">
        <section className="panel p-6 sm:p-7">
          <div className="flex gap-px bg-border border border-border">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-[13px] font-medium transition-colors ${
                  tab === key
                    ? "bg-primary text-white"
                    : "bg-background text-text-secondary hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <p className="mt-5 text-[13px] leading-relaxed text-text-secondary">{active.sub}</p>

          <div className="mt-6">
            <label className="label">Token</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TOKENS.map((t) => (
                <button
                  key={t.address}
                  onClick={() => setTokenAddress(t.address)}
                  data-active={BigInt(t.address) === BigInt(tokenAddress)}
                  className="chip"
                >
                  {t.symbol}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-baseline justify-between gap-3">
              <label className="label">Amount</label>
              {isConnected && spending ? (
                <button
                  onClick={() => setAmount(String(available))}
                  disabled={available <= 0}
                  className="mono text-[11px] text-primary hover:underline disabled:text-text-ghost"
                >
                  Max {formatToken(available)} {token.symbol}
                </button>
              ) : null}
            </div>
            <div className="mt-2 flex items-stretch border border-border focus-within:border-primary transition-colors">
              <input
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className="flex-1 bg-[#101010] px-4 py-3.5 text-[22px] tabular-nums outline-none"
              />
              <span className="grid place-items-center px-4 bg-surface-2 mono text-[12px] text-text-secondary border-l border-border">
                {token.symbol}
              </span>
            </div>
            {overspending ? (
              <p className="mt-2 text-[12px] text-warning">
                More than your private balance of {formatToken(available)} {token.symbol}.
              </p>
            ) : null}
          </div>

          {spending ? (
            <div className="mt-6">
              <label className="label">
                {tab === "transfer" ? "Send to" : "Withdraw to"}
              </label>
              <input
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="0x… (leave empty to use your own address)"
                className="field mono text-[12px] mt-2"
              />
            </div>
          ) : null}

          <div className="mt-6 border border-border bg-[#101010] px-5 py-4">
            <p className="text-[12px] leading-relaxed text-text-secondary">{active.exposes}</p>
          </div>

          <div className="mt-6">
            {!isConnected ? (
              <ConnectButton />
            ) : !isSupportedNetwork ? (
              <p className="text-[13px] text-warning">Switch your wallet to Starknet Mainnet.</p>
            ) : (
              <button
                onClick={() => void run()}
                disabled={isBusy || overspending || !(Number(amount) > 0)}
                className="btn btn-orange w-full"
              >
                {isBusy
                  ? status === "signing"
                    ? "Waiting for wallet…"
                    : "Proving…"
                  : active.cta}
              </button>
            )}
          </div>

          {isBusy ? (
            <p className="mt-3 hint flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-primary rounded-full pulse-dot" />
              Private transactions prove on-chain — this can take up to a minute.
            </p>
          ) : null}

          {txHash ? (
            <a
              href={explorerTxUrl(network, txHash)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 block mono text-[11px] text-primary hover:underline"
            >
              View transaction {shortHex(txHash, 10, 6)} ↗
            </a>
          ) : null}
        </section>

        <section className="panel-flat p-6 sm:p-7 h-fit">
          <h2 className="text-[15px] font-medium">Private balance</h2>

          {!isConnected ? (
            <p className="mt-4 text-[13px] leading-relaxed text-text-secondary">
              Connect a wallet to see it. Your wallet decrypts your balance locally.
            </p>
          ) : balances === null ? (
            <p className="mt-4 hint">Reading…</p>
          ) : balances.length === 0 ? (
            <div className="mt-4">
              <p className="text-[13px] leading-relaxed text-text-secondary">
                Empty. Add a token above, then you can trade it privately.
              </p>
            </div>
          ) : (
            <>
              <ul className="mt-4 divide-y divide-line-subtle">
                {balances.map((balance) => {
                  const info = tokenByAddress(balance.token);
                  return (
                    <li key={balance.token} className="flex items-baseline justify-between gap-3 py-3">
                      <span className="text-[13px] text-text-secondary">
                        {info?.symbol ?? shortHex(balance.token)}
                      </span>
                      <span className="text-[17px] tabular-nums">
                        {formatToken(fromSmallestUnit(balance.amount, info?.decimals ?? 18))}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Link href="/orders" className="btn btn-ghost w-full mt-6">
                Trade it →
              </Link>
            </>
          )}

          <div className="mt-7 pt-5 border-t border-border">
            <p className="label">First time?</p>
            <p className="mt-2 hint">
              Your wallet registers a viewing key with the pool the first time you add funds. You
              only do this once, and you&apos;ll be asked to approve it.
            </p>
          </div>
        </section>
      </div>
    </GhostPageShell>
  );
}
