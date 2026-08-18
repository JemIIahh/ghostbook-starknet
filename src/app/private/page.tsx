"use client";

/**
 * Private balance — the STRK20 core loop.
 *
 * Shield moves an ERC-20 into the pool as an encrypted note, private transfer moves value
 * note-to-note (the actually-private operation), unshield takes it back out to a public address.
 * Every action is executed by the connected wallet through the STRK20 wallet API; GhostBook never
 * touches a viewing key.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Send } from "lucide-react";
import GhostPageShell from "@/components/GhostPageShell";
import GhostLoader from "@/components/GhostLoader";
import TokenIcon from "@/components/TokenIcon";
import ConnectButton from "@/components/wallet/ConnectButton";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { explorerTxUrl, TOKENS, tokenByAddress } from "@/lib/starknet/config";
import {
  parseShieldedBalances,
  privateTransferActions,
  shieldActions,
  unshieldActions,
  type ShieldedBalance,
} from "@/lib/strk20/actions";
import { useStrk20Submit } from "@/lib/strk20/useStrk20Submit";
import { fromSmallestUnit, toSmallestUnit } from "@/lib/strk20/plan";

type Tab = "shield" | "transfer" | "unshield";

const TABS: Array<{ key: Tab; label: string; icon: typeof ArrowDownToLine; hint: string }> = [
  {
    key: "shield",
    label: "Shield",
    icon: ArrowDownToLine,
    hint: "Deposit into the pool. Public: your address, the token and the amount.",
  },
  {
    key: "transfer",
    label: "Private transfer",
    icon: Send,
    hint: "Note to note. On-chain this reveals no amount and no parties.",
  },
  {
    key: "unshield",
    label: "Unshield",
    icon: ArrowUpFromLine,
    hint: "Withdraw to a public address. Destination and amount are public.",
  },
];

export default function PrivateBalancePage() {
  const { isConnected, address, network, isSupportedNetwork, walletAccount } = useWallet();
  const { showSuccess, showError, showInfo } = useToast();
  const { submit, isBusy, status, txHash } = useStrk20Submit();

  const [tab, setTab] = useState<Tab>("shield");
  const [tokenAddress, setTokenAddress] = useState(TOKENS[0].address);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [balances, setBalances] = useState<ShieldedBalance[] | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);

  const token = useMemo(() => tokenByAddress(tokenAddress) ?? TOKENS[0], [tokenAddress]);
  const activeTab = TABS.find((t) => t.key === tab)!;

  const refreshBalances = useCallback(async () => {
    if (!walletAccount) return;
    setLoadingBalances(true);
    try {
      const raw = await walletAccount.strk20Balances([]);
      setBalances(parseShieldedBalances(raw));
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not read shielded balances.");
    } finally {
      setLoadingBalances(false);
    }
  }, [walletAccount, showError]);

  useEffect(() => {
    if (walletAccount) void refreshBalances();
  }, [walletAccount, refreshBalances]);

  const shieldedOf = (tokenAddr: string): bigint => {
    if (!balances) return 0n;
    const target = BigInt(tokenAddr);
    return balances.find((b) => BigInt(b.token) === target)?.amount ?? 0n;
  };

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

    const to = recipient.trim() || address;
    if (tab !== "shield") {
      try {
        BigInt(to);
      } catch {
        showError("Enter a valid Starknet address.");
        return;
      }
    }

    const actions =
      tab === "shield"
        ? shieldActions(token.address, parsed)
        : tab === "transfer"
          ? privateTransferActions(token.address, parsed, to)
          : unshieldActions(token.address, parsed, to);

    showInfo("Confirm in your wallet. Privacy-pool transactions take a moment to prove.");
    const result = await submit(actions);
    if (result.status === "success") {
      showSuccess(`${activeTab.label} confirmed.`);
      setAmount("");
      void refreshBalances();
    } else if (result.error) {
      showError(result.error);
    }
  };

  return (
    <GhostPageShell
      title="Private balance"
      subtitle="Shield, transfer privately, unshield — through the STRK20 pool"
      maxWidth="md"
      headerRight={
        isConnected ? (
          <button
            onClick={() => void refreshBalances()}
            disabled={loadingBalances}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border text-[12px] hover:bg-surface-2 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingBalances ? "animate-spin" : ""}`} />
            Balances
          </button>
        ) : null
      }
    >
      <div className="rounded-2xl bg-surface border border-border p-4 sm:p-5">
        <div className="flex gap-1 p-1 rounded-full bg-surface-2 mb-4">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-full text-[12px] sm:text-[13px] font-medium transition-colors ${
                tab === key ? "bg-surface text-foreground" : "text-text-secondary hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <p className="text-[12px] text-text-secondary mb-4">{activeTab.hint}</p>

        <label className="block text-[11px] uppercase tracking-wide text-text-secondary mb-1.5">
          Token
        </label>
        <div className="flex gap-2 mb-4">
          {TOKENS.map((t) => (
            <button
              key={t.address}
              onClick={() => setTokenAddress(t.address)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${
                BigInt(t.address) === BigInt(tokenAddress)
                  ? "border-primary bg-primary-soft"
                  : "border-border bg-surface-2 hover:border-border-hover"
              }`}
            >
              <TokenIcon symbol={t.symbol} size="sm" />
              {t.symbol}
            </button>
          ))}
        </div>

        <label className="block text-[11px] uppercase tracking-wide text-text-secondary mb-1.5">
          Amount
        </label>
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 border border-border px-3 py-2.5 mb-1">
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.0"
            className="flex-1 bg-transparent outline-none text-lg tabular-nums"
          />
          <span className="text-sm text-text-secondary">{token.symbol}</span>
        </div>
        <p className="text-[11px] text-text-secondary mb-4">
          Shielded: {fromSmallestUnit(shieldedOf(token.address), token.decimals)} {token.symbol}
        </p>

        {tab !== "shield" ? (
          <>
            <label className="block text-[11px] uppercase tracking-wide text-text-secondary mb-1.5">
              {tab === "transfer" ? "Recipient (Starknet address)" : "Withdraw to"}
            </label>
            <input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder={address ?? "0x…"}
              className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2.5 mb-4 text-sm font-mono outline-none focus:border-border-hover"
            />
          </>
        ) : null}

        {!isConnected ? (
          <ConnectButton />
        ) : !isSupportedNetwork ? (
          <p className="text-[12px] text-warning">
            Switch your wallet to Starknet Mainnet — the STRK20 pool lives there.
          </p>
        ) : (
          <button
            onClick={() => void run()}
            disabled={isBusy}
            className="w-full py-3 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-semibold transition-colors"
          >
            {isBusy ? (status === "signing" ? "Waiting for wallet…" : "Proving & relaying…") : activeTab.label}
          </button>
        )}

        {isBusy ? (
          <div className="mt-4 flex items-center gap-3 text-[12px] text-text-secondary">
            <GhostLoader size="sm" />
            Private transactions verify a STARK proof on-chain — this can take a minute.
          </div>
        ) : null}

        {txHash ? (
          <a
            href={explorerTxUrl(network, txHash)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 block text-[12px] text-primary hover:underline font-mono truncate"
          >
            {txHash} ↗
          </a>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl bg-surface border border-border p-4">
        <h2 className="text-sm font-semibold mb-2">Shielded balances</h2>
        {!isConnected ? (
          <p className="text-[12px] text-text-secondary">Connect a wallet to read your notes.</p>
        ) : balances === null ? (
          <p className="text-[12px] text-text-secondary">Loading…</p>
        ) : balances.length === 0 ? (
          <p className="text-[12px] text-text-secondary">
            Nothing shielded yet. Shield a token to create your first note.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {balances.map((balance) => {
              const info = tokenByAddress(balance.token);
              return (
                <li
                  key={balance.token}
                  className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0"
                >
                  <span className="flex items-center gap-2">
                    <TokenIcon symbol={info?.symbol ?? "?"} size="sm" />
                    {info?.symbol ?? `${balance.token.slice(0, 10)}…`}
                  </span>
                  <span className="tabular-nums">
                    {fromSmallestUnit(balance.amount, info?.decimals ?? 18)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-text-secondary">
        Deposits and withdrawals are public by design — the pool records the depositor, token and
        amount. Note-to-note transfers reveal neither amount nor parties. GhostBook claims identity
        privacy, not amount privacy.
      </p>
    </GhostPageShell>
  );
}
