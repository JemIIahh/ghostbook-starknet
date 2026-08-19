"use client";

/**
 * Balance — the private-balance card.
 *
 * Three operations with very different privacy properties share one card, so the mode switch also
 * switches the disclosure line: what each one puts on-chain is stated before it is used. All three
 * are executed by the wallet through the STRK20 wallet API; this app never touches a viewing key.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ChevronDown,
  ExternalLink,
  Lock,
  RefreshCw,
  Shield,
  X,
} from "lucide-react";
import Link from "next/link";
import GhostPageShell from "@/components/GhostPageShell";
import GhostLoader from "@/components/GhostLoader";
import TokenIcon from "@/components/TokenIcon";
import ConnectButton from "@/components/wallet/ConnectButton";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { explorerTxUrl, TOKENS, tokenByAddress } from "@/lib/starknet/config";
import { privateTransferActions, shieldActions, unshieldActions } from "@/lib/strk20/actions";
import { useStrk20Submit } from "@/lib/strk20/useStrk20Submit";
import { useShieldedBalances } from "@/lib/strk20/useShieldedBalances";
import { fromSmallestUnit, toSmallestUnit } from "@/lib/strk20/plan";
import { friendlyError } from "@/lib/errors";
import { formatToken, shortHex } from "@/lib/format";

type Mode = "shield" | "send" | "withdraw";

/** Per-mode copy. `exposes` is the honest disclosure — no mode claims more privacy than it has. */
const MODES: Record<
  Mode,
  {
    label: string;
    subtitle: string;
    payLabel: string;
    receiveLabel: string;
    cta: string;
    exposes: string;
  }
> = {
  shield: {
    label: "Shield",
    subtitle: "Move tokens into the privacy pool",
    payLabel: "You shield",
    receiveLabel: "Private balance after",
    cta: "Shield",
    exposes:
      "Your address, the token and the amount are public. Privacy starts after this step — it cannot cover the deposit itself.",
  },
  send: {
    label: "Send",
    subtitle: "Note-to-note transfer inside the pool",
    payLabel: "You send",
    receiveLabel: "Recipient",
    cta: "Send privately",
    exposes:
      "No amount and no parties on-chain. This is the strongest privacy the pool offers — value never leaves it.",
  },
  withdraw: {
    label: "Withdraw",
    subtitle: "Take tokens back out to a public address",
    payLabel: "You withdraw",
    receiveLabel: "Destination",
    cta: "Withdraw",
    exposes:
      "The destination and amount are public. Which deposit they came from is not.",
  },
};

const MODE_ORDER: Mode[] = ["shield", "send", "withdraw"];

export default function BalancePage() {
  const { isConnected, address, network, isSupportedNetwork } = useWallet();
  const { showSuccess, showError, showInfo } = useToast();
  const { submit, isBusy, status, txHash } = useStrk20Submit();
  const { balances, balanceOf, loading, refresh } = useShieldedBalances();

  const [mode, setMode] = useState<Mode>("shield");
  const [tokenAddress, setTokenAddress] = useState(TOKENS[0].address);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [selectingToken, setSelectingToken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = useMemo(() => tokenByAddress(tokenAddress) ?? TOKENS[0], [tokenAddress]);
  const copy = MODES[mode];
  const available = fromSmallestUnit(balanceOf(token.address), token.decimals);
  /** Shield tops the pool up; the other two spend from it. */
  const spending = mode !== "shield";
  const amountNumber = Number(amount);
  const hasAmount = Number.isFinite(amountNumber) && amountNumber > 0;
  const overspending = spending && hasAmount && amountNumber > available;

  // Clear the form when switching mode, so an amount typed for one doesn't carry into another.
  useEffect(() => {
    setAmount("");
    setError(null);
  }, [mode]);

  const run = async () => {
    if (!address) return;
    setError(null);

    let parsed: bigint;
    try {
      parsed = toSmallestUnit(amountNumber, token.decimals);
    } catch {
      setError("Enter a valid amount.");
      return;
    }
    if (parsed <= 0n) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (overspending) {
      setError(`You only have ${formatToken(available)} ${token.symbol} in your private balance.`);
      return;
    }

    const to = recipient.trim() || address;
    if (spending) {
      try {
        BigInt(to);
      } catch {
        setError("That doesn't look like a Starknet address.");
        return;
      }
    }

    const actions =
      mode === "shield"
        ? shieldActions(token.address, parsed)
        : mode === "send"
          ? privateTransferActions(token.address, parsed, to)
          : unshieldActions(token.address, parsed, to);

    showInfo("Confirm in your wallet — proving takes a moment.");
    const result = await submit(actions);
    if (result.status === "success") {
      showSuccess(
        mode === "shield"
          ? `Shielded ${formatToken(amountNumber)} ${token.symbol}.`
          : mode === "send"
            ? `Sent ${formatToken(amountNumber)} ${token.symbol} privately.`
            : `Withdrew ${formatToken(amountNumber)} ${token.symbol}.`,
      );
      setAmount("");
      void refresh();
    } else if (result.error) {
      const message = friendlyError(result.error);
      setError(message);
      showError(message);
    }
  };

  const actionLabel = isBusy
    ? status === "signing"
      ? "Waiting for wallet…"
      : "Proving…"
    : !hasAmount
      ? "Enter an amount"
      : overspending
        ? "Not enough private balance"
        : spending && !recipient.trim()
          ? `${copy.cta} to yourself`
          : copy.cta;

  return (
    <GhostPageShell
      title="Balance"
      subtitle={copy.subtitle}
      maxWidth="xs"
      headerRight={
        <div className="flex items-center gap-1.5">
          <div className="hidden sm:inline-flex px-2.5 py-1.5 rounded-full text-[11px] font-semibold border items-center gap-1 bg-primary-soft text-primary border-primary/30">
            <Shield className="w-3 h-3" />
            STRK20
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={!isConnected || loading}
            className="p-2 rounded-xl border bg-surface text-text-secondary border-border hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-50"
            aria-label="Refresh private balance"
            title="Refresh private balance"
          >
            <RefreshCw className={`w-[18px] h-[18px] ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      }
    >
      {/* Mode switch */}
      <div className="flex gap-1.5 p-1 rounded-2xl bg-surface-2 mb-3">
        {MODE_ORDER.map((key) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
              mode === key
                ? "bg-surface text-foreground border border-border"
                : "text-text-secondary hover:text-foreground"
            }`}
          >
            {MODES[key].label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-surface border border-border p-4 mb-4 text-sm text-text-secondary leading-relaxed">
        <div className="flex items-start gap-2">
          <Lock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p>
            <span className="text-foreground font-medium">{copy.label}.</span> {copy.exposes}
          </p>
        </div>
      </div>

      <div className="rounded-3xl bg-surface border border-border p-1.5">
        <div className="rounded-2xl bg-surface-2 p-4 sm:p-5">
          <div className="flex items-center justify-between text-sm text-text-tertiary mb-2">
            <span>{copy.payLabel}</span>
            <button
              type="button"
              onClick={() => setAmount(String(available))}
              disabled={!isConnected || available <= 0}
              className="text-xs hover:text-foreground transition-colors disabled:hover:text-text-tertiary"
              title="Use your full private balance"
            >
              Bal: {isConnected ? formatToken(available) : "0.00"}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 text-[32px] sm:text-4xl font-medium bg-transparent focus:outline-none placeholder-text-tertiary min-w-0"
            />
            <button
              onClick={() => setSelectingToken(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface hover:bg-surface-hover border border-border transition-colors shrink-0"
            >
              <TokenIcon symbol={token.symbol} size="sm" />
              <span className="text-[15px] font-semibold">{token.symbol}</span>
              <ChevronDown className="w-4 h-4 text-text-tertiary" />
            </button>
          </div>
          {overspending ? (
            <p className="mt-2 text-xs text-warning">
              More than your private balance of {formatToken(available)} {token.symbol}.
            </p>
          ) : null}
        </div>

        <div className="flex justify-center -my-3 relative z-10">
          <div className="w-9 h-9 rounded-xl bg-surface border-[3px] border-background flex items-center justify-center">
            <ArrowDown className="w-4 h-4 text-text-secondary" />
          </div>
        </div>

        <div className="rounded-2xl bg-surface-2 p-4 sm:p-5">
          <div className="flex items-center justify-between text-sm text-text-tertiary mb-2">
            <span className="inline-flex items-center gap-1">
              {spending ? null : <Lock className="w-3 h-3" />}
              {copy.receiveLabel}
            </span>
            {spending ? (
              <span className="text-xs">Optional — defaults to you</span>
            ) : (
              <span className="text-xs">Bal: {isConnected ? formatToken(available) : "0.00"}</span>
            )}
          </div>

          {spending ? (
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
              className="w-full font-mono text-sm bg-transparent focus:outline-none placeholder-text-tertiary py-1.5"
            />
          ) : (
            <div className="flex items-center gap-3">
              <span
                className={`flex-1 text-[32px] sm:text-4xl font-medium truncate ${
                  hasAmount ? "" : "text-text-tertiary"
                }`}
              >
                {formatToken(available + (hasAmount ? amountNumber : 0))}
              </span>
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface border border-border shrink-0">
                <TokenIcon symbol={token.symbol} size="sm" />
                <span className="text-[15px] font-semibold">{token.symbol}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {!isConnected ? (
        <div className="mt-3">
          <ConnectButton variant="full" />
        </div>
      ) : !isSupportedNetwork ? (
        <div className="mt-3 rounded-2xl bg-surface border border-border p-4 text-sm text-warning">
          Switch your wallet to Starknet Mainnet — the STRK20 pool lives there.
        </div>
      ) : (
        <button
          onClick={() => void run()}
          disabled={isBusy || !hasAmount || overspending}
          className="mt-3 w-full px-4 py-3.5 rounded-2xl bg-primary hover:bg-primary-hover text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
        >
          {isBusy ? <GhostLoader size="sm" className="scale-75" /> : <Lock className="w-4 h-4" />}
          {actionLabel}
        </button>
      )}

      {isBusy ? (
        <p className="mt-3 text-xs text-text-tertiary text-center">
          Private transactions prove on-chain — this can take up to a minute.
        </p>
      ) : null}

      {/* Private balance */}
      <div className="mt-3 rounded-2xl bg-surface border border-border p-4 text-sm">
        <div className="text-xs text-text-tertiary mb-2">Private balance</div>
        {!isConnected ? (
          <p className="text-text-secondary leading-relaxed">
            Connect a wallet to see it — your wallet decrypts it locally.
          </p>
        ) : balances === null ? (
          <p className="text-text-secondary">Reading…</p>
        ) : balances.length === 0 ? (
          <p className="text-text-secondary leading-relaxed">
            Empty. Shield a token above, then you can trade it privately.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {balances.map((balance) => {
                const info = tokenByAddress(balance.token);
                return (
                  <li
                    key={balance.token}
                    className="flex items-center justify-between gap-3 py-2 first:pt-0"
                  >
                    <span className="flex items-center gap-2 text-text-secondary">
                      <TokenIcon symbol={info?.symbol ?? "?"} size="sm" />
                      {info?.symbol ?? shortHex(balance.token)}
                    </span>
                    <span className="font-mono">
                      {formatToken(fromSmallestUnit(balance.amount, info?.decimals ?? 18))}
                    </span>
                  </li>
                );
              })}
            </ul>
            <Link
              href="/orders"
              className="mt-3 flex items-center justify-center w-full py-2.5 rounded-xl bg-surface-2 hover:bg-surface-hover text-sm font-medium transition-colors"
            >
              Trade it →
            </Link>
          </>
        )}
        <p className="mt-3 pt-3 border-t border-border text-xs text-text-tertiary leading-relaxed">
          Your wallet registers a viewing key with the pool the first time you shield. That happens
          once, and the wallet asks you to approve it.
        </p>
      </div>

      {txHash ? (
        <div className="mt-3 rounded-2xl bg-surface border border-border p-4 text-sm flex items-center justify-between">
          <span className="text-text-secondary">Last transaction</span>
          <a
            href={explorerTxUrl(network, txHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary font-mono text-xs"
          >
            {shortHex(txHash, 10, 6)} <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-2xl bg-danger/10 border border-danger/20 p-4 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <AnimatePresence>
        {selectingToken && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectingToken(false)}
          >
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[360px] rounded-2xl bg-surface border border-border p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Select token</h3>
                <button
                  onClick={() => setSelectingToken(false)}
                  className="p-1 rounded-lg hover:bg-surface-hover"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2">
                {TOKENS.map((t) => (
                  <button
                    key={t.address}
                    onClick={() => {
                      setTokenAddress(t.address);
                      setSelectingToken(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-hover transition-colors"
                  >
                    <TokenIcon symbol={t.symbol} size="md" />
                    <div className="text-left min-w-0">
                      <div className="text-sm font-medium">{t.symbol}</div>
                      <div className="text-xs text-text-tertiary font-mono truncate">
                        {shortHex(t.address, 8, 6)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </GhostPageShell>
  );
}
