"use client";

/**
 * Balance — the private-balance card.
 *
 * Three operations with very different privacy properties share one card, so the mode switch also
 * switches the disclosure line: what each one puts on-chain is stated before it is used. All three
 * are executed by the wallet through the STRK20 wallet API; this app never touches a viewing key.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { walletV6 } from "starknet";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
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
import { explorerTxUrl, providerFor, TOKENS, tokenByAddress } from "@/lib/starknet/config";
import { isViewingKeyRegistered, readErc20Balance } from "@/lib/starknet/erc20";
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

/**
 * Step zero, which GhostBook can't do for you: getting tokens into a Starknet wallet at all.
 *
 * A link, nothing more — execution stays on Ekubo. It costs no privacy either: shielding is already
 * a public deposit, so an on-ramp reveals nothing the deposit wasn't going to reveal anyway.
 */
const ONRAMP_URL = "https://app.avnu.fi/en/buy";

export default function BalancePage() {
  const { isConnected, address, network, isSupportedNetwork, wallet } = useWallet();
  const { showSuccess, showError, showInfo } = useToast();
  const { submit, isBusy, status, txHash } = useStrk20Submit();
  const { balances, balanceOf, loading, refresh } = useShieldedBalances();

  const [mode, setMode] = useState<Mode>("shield");
  const [tokenAddress, setTokenAddress] = useState(TOKENS[0].address);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [selectingToken, setSelectingToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What the connected address holds publicly — what Shield actually spends from. */
  const [publicRaw, setPublicRaw] = useState<bigint | null>(null);
  /** null = unknown / unreachable pool, false = no viewing key yet. */
  const [registered, setRegistered] = useState<boolean | null>(null);
  /**
   * What the connected wallet actually advertises.
   *
   * Registration is wallet-side and no dapp can trigger it, so when it's missing the only useful
   * thing an app can do is report precisely what the wallet does and doesn't support — otherwise
   * "set it up in your wallet" is untestable advice.
   */
  const [probe, setProbe] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  const token = useMemo(() => tokenByAddress(tokenAddress) ?? TOKENS[0], [tokenAddress]);
  const copy = MODES[mode];
  const available = fromSmallestUnit(balanceOf(token.address), token.decimals);
  /** Shield tops the pool up; the other two spend from it. */
  const spending = mode !== "shield";
  const publicBalance =
    publicRaw === null ? null : fromSmallestUnit(publicRaw, token.decimals);
  /** The balance the current mode draws on: wallet for Shield, pool for Send/Withdraw. */
  const sourceBalance = spending ? available : (publicBalance ?? 0);
  const amountNumber = Number(amount);
  const hasAmount = Number.isFinite(amountNumber) && amountNumber > 0;
  const overspending =
    hasAmount && (spending ? amountNumber > available : publicBalance !== null && amountNumber > publicBalance);

  const refreshPublic = useCallback(async () => {
    if (!address) {
      setPublicRaw(null);
      return;
    }
    setPublicRaw(await readErc20Balance(providerFor(network), token.address, address));
  }, [address, network, token.address]);

  // Every pool action reverts with NOT_REGISTERED until the wallet has set a viewing key, and a
  // dapp can't do it (the wallet API has no such action). Detect it rather than let the user find
  // out by spending a transaction.
  const probeWallet = useCallback(async () => {
    if (!wallet) return;
    setProbing(true);
    const lines: string[] = [];
    const attempt = async (label: string, run: () => Promise<unknown>) => {
      try {
        lines.push(`${label}: ${JSON.stringify(await run())}`);
      } catch (err) {
        lines.push(`${label}: ERROR ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    await attempt("wallet", async () => wallet.name);
    await attempt("supportedWalletApi", () => walletV6.supportedWalletApi(wallet));
    await attempt("supportedSpecs", () => walletV6.supportedSpecs(wallet));
    // If this resolves, the wallet implements the STRK20 read path.
    await attempt("strk20Balances", () => walletV6.strk20Balances(wallet, []));
    setProbe(lines.join("\n"));
    setProbing(false);
  }, [wallet]);

  const refreshRegistration = useCallback(async () => {
    if (!address || !network.privacyPool) {
      setRegistered(null);
      return;
    }
    setRegistered(await isViewingKeyRegistered(providerFor(network), network.privacyPool, address));
  }, [address, network]);

  useEffect(() => {
    void refreshRegistration();
  }, [refreshRegistration]);

  useEffect(() => {
    void refreshPublic();
  }, [refreshPublic]);

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
      setError(
        spending
          ? `You only have ${formatToken(available)} ${token.symbol} in your private balance.`
          : `You only have ${formatToken(publicBalance ?? 0)} ${token.symbol} in your wallet.`,
      );
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
      void Promise.all([refresh(), refreshPublic(), refreshRegistration()]);
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
      : registered === false
        ? "Set up your private balance first"
        : overspending
          ? spending
            ? "Not enough private balance"
            : `Not enough ${token.symbol} in your wallet`
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
      {registered === false ? (
        <div className="mb-3 rounded-2xl bg-warning/10 border border-warning/25 p-4 flex gap-2.5">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <p className="text-foreground font-medium">Private balance not set up yet</p>
            <p className="text-text-secondary mt-1">
              The pool holds no viewing key for this address —{" "}
              <code className="font-mono text-xs">get_public_key</code> returns 0. Registering one is{" "}
              <code className="font-mono text-xs">SetViewingKey</code>, which the wallet API does not
              expose to apps, so only {wallet?.name ?? "your wallet"} can do it. Every pool action
              also needs a proof-carrying transaction, which only a wallet or service with a proving
              backend can produce.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                onClick={() => void refreshRegistration()}
                className="px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-hover text-xs font-medium transition-colors"
              >
                Check again
              </button>
              <button
                onClick={() => void probeWallet()}
                disabled={probing}
                className="px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-hover text-xs font-medium transition-colors disabled:opacity-50"
              >
                {probing ? "Checking…" : "What does my wallet support?"}
              </button>
            </div>
            {probe ? (
              <pre className="mt-2.5 p-2.5 rounded-xl bg-background border border-border text-[10px] leading-relaxed font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap">
                {probe}
              </pre>
            ) : null}
          </div>
        </div>
      ) : null}

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
              onClick={() => setAmount(String(sourceBalance))}
              disabled={!isConnected || sourceBalance <= 0}
              className="text-xs hover:text-foreground transition-colors disabled:hover:text-text-tertiary"
              title={spending ? "Use your full private balance" : "Use your full wallet balance"}
            >
              {spending ? "Private" : "Wallet"}:{" "}
              {!isConnected
                ? "0.00"
                : spending
                  ? formatToken(available)
                  : publicRaw === null
                    ? "…"
                    : formatToken(publicBalance)}
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
              More than your {spending ? "private balance" : "wallet balance"} of{" "}
              {formatToken(spending ? available : (publicBalance ?? 0))} {token.symbol}.
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
              <span className="text-xs">
                Private now: {isConnected ? formatToken(available) : "0.00"}
              </span>
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
          disabled={isBusy || !hasAmount || overspending || registered === false}
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
          <>
            <p className="text-text-secondary leading-relaxed">
              Empty — nothing is in the pool yet.{" "}
              {publicBalance && publicBalance > 0 ? (
                <>
                  Your wallet holds{" "}
                  <span className="text-foreground font-medium">
                    {formatToken(publicBalance)} {token.symbol}
                  </span>
                  ; shield some above to trade it privately.
                </>
              ) : (
                <>Shield a token above, then you can trade it privately.</>
              )}
            </p>
            <a
              href={ONRAMP_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-surface-2 hover:bg-surface-hover text-sm font-medium transition-colors"
            >
              No {token.symbol} yet? Buy on Starknet
              <ExternalLink className="w-3.5 h-3.5 text-text-tertiary" />
            </a>
          </>
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
        <div className="mt-3 pt-3 border-t border-border text-xs text-text-tertiary leading-relaxed">
          <p className="text-text-secondary mb-1.5">First time here?</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              Get STRK, ETH or USDC into your Starknet wallet — an{" "}
              <a
                href={ONRAMP_URL}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                on-ramp
              </a>{" "}
              works if you&apos;re starting from nothing.
            </li>
            <li>
              Set up the private balance in your wallet. That registers a viewing key with the pool,
              and it&apos;s the one step no app can do for you.
            </li>
            <li>Shield a token above.</li>
            <li>
              <Link href="/orders" className="text-primary hover:underline">
                Commit an order
              </Link>{" "}
              and fill it slice by slice.
            </li>
          </ol>
        </div>
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
