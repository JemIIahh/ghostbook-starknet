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
import { RefreshCw } from "lucide-react";
import GhostPageShell from "@/components/GhostPageShell";
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
import { friendlyError } from "@/lib/errors";

type Tab = "shield" | "transfer" | "unshield";

const TABS: Array<{ key: Tab; label: string; cta: string; hint: string; visibility: string }> = [
  {
    key: "shield",
    label: "Shield",
    cta: "Shield",
    hint: "Deposit an ERC-20 and receive an encrypted note.",
    visibility: "Public: your address, the token, the amount. Deposits are screened on-chain.",
  },
  {
    key: "transfer",
    label: "Transfer",
    cta: "Send privately",
    hint: "Move value note to note, inside the pool.",
    visibility: "Private: no amount and no parties appear on-chain. This is the real privacy.",
  },
  {
    key: "unshield",
    label: "Unshield",
    cta: "Unshield",
    hint: "Withdraw from a note to a public address.",
    visibility: "Public: destination and amount. Private: which deposit it came from.",
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
  const active = TABS.find((t) => t.key === tab)!;

  const refreshBalances = useCallback(async () => {
    if (!walletAccount) return;
    setLoadingBalances(true);
    try {
      setBalances(parseShieldedBalances(await walletAccount.strk20Balances([])));
    } catch (err) {
      showError(friendlyError(err, "Could not read shielded balances."));
    } finally {
      setLoadingBalances(false);
    }
  }, [walletAccount, showError]);

  useEffect(() => {
    if (walletAccount) void refreshBalances();
  }, [walletAccount, refreshBalances]);

  const shieldedOf = (addr: string): bigint => {
    if (!balances) return 0n;
    const target = BigInt(addr);
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

    showInfo("Confirm in your wallet — the proof takes a moment.");
    const result = await submit(actions);
    if (result.status === "success") {
      showSuccess(`${active.label} confirmed.`);
      setAmount("");
      void refreshBalances();
    } else if (result.error) {
      showError(friendlyError(result.error));
    }
  };

  return (
    <GhostPageShell
      eyebrow="Private balance"
      title="Shield. Send. Unshield."
      subtitle="The STRK20 pool holds ERC-20s as encrypted notes. Deposits and withdrawals are public by design; what happens between them is not."
      maxWidth="lg"
      headerRight={
        isConnected ? (
          <button
            onClick={() => void refreshBalances()}
            disabled={loadingBalances}
            className="btn btn-ghost !py-2 !px-3.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingBalances ? "animate-spin" : ""}`} />
            Refresh
          </button>
        ) : null
      }
    >
      <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-4">
        {/* ── Action panel ─────────────────────────────────────────────── */}
        <div className="panel p-6 sm:p-7">
          <div className="flex gap-px bg-border border border-border">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 px-3 py-3 mono text-[11px] tracking-[0.16em] uppercase transition-colors ${
                  tab === t.key
                    ? "bg-primary text-white"
                    : "bg-background text-text-secondary hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <p className="mt-5 text-[13px] leading-relaxed text-text-secondary">{active.hint}</p>

          <div className="mt-7">
            <p className="label">Token</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {TOKENS.map((t) => (
                <button
                  key={t.address}
                  onClick={() => setTokenAddress(t.address)}
                  data-active={BigInt(t.address) === BigInt(tokenAddress)}
                  className="chip"
                >
                  <TokenIcon symbol={t.symbol} size="sm" />
                  {t.symbol}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-baseline justify-between">
              <p className="label">Amount</p>
              <p className="mono text-[10px] tracking-[0.14em] uppercase text-text-tertiary">
                shielded {fromSmallestUnit(shieldedOf(token.address), token.decimals)} {token.symbol}
              </p>
            </div>
            <div className="mt-2.5 flex items-stretch border border-border focus-within:border-primary transition-colors">
              <input
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className="flex-1 bg-[#101010] px-4 py-3.5 display text-[clamp(22px,2.4vw,30px)] tabular-nums outline-none"
              />
              <span className="grid place-items-center px-4 bg-surface-2 mono text-[12px] tracking-[0.1em] text-text-secondary border-l border-border">
                {token.symbol}
              </span>
            </div>
          </div>

          {tab !== "shield" ? (
            <div className="mt-6">
              <p className="label">{tab === "transfer" ? "Recipient" : "Withdraw to"}</p>
              <input
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder={address ?? "0x…"}
                className="field mono text-[12px] mt-2.5"
              />
              <p className="mt-2 text-[11px] text-text-tertiary">
                Leave empty to use your connected account.
              </p>
            </div>
          ) : null}

          <div className="mt-7 border-t border-line-subtle pt-5">
            <p className="text-[11px] leading-relaxed text-text-tertiary">{active.visibility}</p>
          </div>

          <div className="mt-5">
            {!isConnected ? (
              <ConnectButton />
            ) : !isSupportedNetwork ? (
              <p className="mono text-[11px] tracking-[0.12em] uppercase text-warning">
                Switch to Starknet Mainnet
              </p>
            ) : (
              <button onClick={() => void run()} disabled={isBusy} className="btn btn-orange w-full">
                {isBusy
                  ? status === "signing"
                    ? "Waiting for wallet…"
                    : "Proving & relaying…"
                  : active.cta}
              </button>
            )}
          </div>

          {isBusy ? (
            <p className="mt-4 mono text-[10px] tracking-[0.18em] uppercase text-text-tertiary flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-primary rounded-full pulse-dot" />
              Verifying a STARK proof on-chain
            </p>
          ) : null}

          {txHash ? (
            <a
              href={explorerTxUrl(network, txHash)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 block mono text-[11px] text-primary hover:underline truncate"
            >
              {txHash} ↗
            </a>
          ) : null}
        </div>

        {/* ── Notes ────────────────────────────────────────────────────── */}
        <div className="panel-flat p-6 sm:p-7 h-fit">
          <p className="tag">[ Shielded balances ]</p>

          {!isConnected ? (
            <p className="mt-5 text-[13px] text-text-secondary leading-relaxed">
              Connect a wallet to read your notes. The wallet decrypts them locally — this app never
              sees your viewing key.
            </p>
          ) : balances === null ? (
            <p className="mt-5 mono text-[11px] tracking-[0.16em] uppercase text-text-tertiary">
              Reading…
            </p>
          ) : balances.length === 0 ? (
            <p className="mt-5 text-[13px] text-text-secondary leading-relaxed">
              Nothing shielded yet. Shield a token to create your first note, then trade it privately
              from <span className="text-primary">Orders</span>.
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-line-subtle">
              {balances.map((balance) => {
                const info = tokenByAddress(balance.token);
                return (
                  <li key={balance.token} className="flex items-center justify-between gap-3 py-3.5">
                    <TokenIcon symbol={info?.symbol ?? "?"} size="sm" showLabel />
                    <span className="display text-[19px] tabular-nums">
                      {fromSmallestUnit(balance.amount, info?.decimals ?? 18)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-7 border-t border-border pt-5 space-y-3">
            <p className="label">Before your first shield</p>
            <p className="text-[12px] leading-relaxed text-text-secondary">
              Every pool user registers a viewing key once, on-chain. Wallets with STRK20 support do
              this for you the first time you shield.
            </p>
          </div>
        </div>
      </div>
    </GhostPageShell>
  );
}
