"use client";

/**
 * Orders — private limit orders and private TWAP/DCA.
 *
 * A plan commits the terms once (limit price, slice size, pacing, budget, expiry). Each fill is one
 * private transaction: withdraw a slice to the anonymizer, open a note for the output, invoke the
 * anonymizer. The contract enforces the terms, so a fill can never deviate from what was committed —
 * and progress is read back from on-chain state keyed by the salted plan hash.
 *
 * Plan terms live in this browser: the contract stores only the hash, so export them if you care
 * about filling the rest of an order later.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Download, Plus, RefreshCw, Trash2, Zap } from "lucide-react";
import GhostPageShell from "@/components/GhostPageShell";
import GhostLoader from "@/components/GhostLoader";
import TokenIcon from "@/components/TokenIcon";
import ConnectButton from "@/components/wallet/ConnectButton";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { explorerTxUrl, TOKENS, tokenByAddress, type TokenInfo } from "@/lib/starknet/config";
import { providerFor } from "@/lib/starknet/config";
import { findBestPool, type Quote } from "@/lib/starknet/quote";
import {
  buildPlan,
  bpsFromFee,
  fromSmallestUnit,
  limitPriceOf,
  requiredOut,
  toSmallestUnit,
  tokenOutOf,
  type OrderPlan,
} from "@/lib/strk20/plan";
import { fillSliceActions } from "@/lib/strk20/actions";
import {
  EMPTY_PLAN_STATE,
  parseSliceFilled,
  planProgress,
  readPlanState,
  type PlanState,
} from "@/lib/strk20/anonymizer";
import { exportPlans, plansWithTerms, removePlan, savePlan } from "@/lib/strk20/store";
import { useStrk20Submit } from "@/lib/strk20/useStrk20Submit";

type PlanRow = {
  hash: string;
  label: string;
  createdAt: number;
  plan: OrderPlan;
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  state: PlanState;
};

const FALLBACK_TOKEN: TokenInfo = TOKENS[0];

function tokenOr(address: string): TokenInfo {
  return tokenByAddress(address) ?? { ...FALLBACK_TOKEN, symbol: "?", address, decimals: 18 };
}

function secondsToLabel(seconds: number): string {
  if (seconds <= 0) return "now";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  return `${Math.ceil(seconds / 3600)}h`;
}

export default function OrdersPage() {
  const { isConnected, address, network, isSupportedNetwork } = useWallet();
  const { showSuccess, showError, showInfo } = useToast();
  const { submit, isBusy, status, txHash } = useStrk20Submit();

  const [sellSymbol, setSellSymbol] = useState("STRK");
  const [buySymbol, setBuySymbol] = useState("ETH");
  const [total, setTotal] = useState("10");
  const [slice, setSlice] = useState("2");
  const [intervalMinutes, setIntervalMinutes] = useState("15");
  const [expiryHours, setExpiryHours] = useState("24");
  const [limitPrice, setLimitPrice] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [fillingHash, setFillingHash] = useState<string | null>(null);

  const sellToken = useMemo(() => TOKENS.find((t) => t.symbol === sellSymbol) ?? TOKENS[0], [sellSymbol]);
  const buyToken = useMemo(
    () => TOKENS.find((t) => t.symbol === buySymbol) ?? TOKENS[1],
    [buySymbol],
  );
  const anonymizer = network.anonymizer;
  const deployed = Boolean(anonymizer);

  /** Quote the slice through Ekubo so the plan's limit price starts from a real market price. */
  const refreshQuote = useCallback(async () => {
    if (sellToken.symbol === buyToken.symbol) {
      setQuote(null);
      return;
    }
    const sliceAmount = Number(slice);
    if (!Number.isFinite(sliceAmount) || sliceAmount <= 0) {
      setQuote(null);
      return;
    }
    setQuoting(true);
    try {
      const best = await findBestPool(
        providerFor(network),
        network.ekuboRouter,
        sellToken.address,
        buyToken.address,
        toSmallestUnit(sliceAmount, sellToken.decimals),
        sellToken.decimals,
        buyToken.decimals,
      );
      setQuote(best);
      if (best && !limitPrice) setLimitPrice(String(Number(best.price.toPrecision(6))));
    } finally {
      setQuoting(false);
    }
  }, [network, sellToken, buyToken, slice, limitPrice]);

  useEffect(() => {
    void refreshQuote();
    // Re-quote when the pair or slice changes, not on every limit-price keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network.key, sellToken.address, buyToken.address, slice]);

  const loadRows = useCallback(async () => {
    if (!address) {
      setRows([]);
      return;
    }
    setRefreshing(true);
    try {
      const stored = plansWithTerms(network.key, address);
      const provider = providerFor(network);
      const next = await Promise.all(
        stored.map(async ({ stored: meta, plan }) => {
          let state = EMPTY_PLAN_STATE;
          if (deployed) {
            try {
              state = await readPlanState(provider, anonymizer, plan);
            } catch {
              /* unreachable node or fresh plan — treat as empty */
            }
          }
          return {
            hash: meta.hash,
            label: meta.label,
            createdAt: meta.createdAt,
            plan,
            tokenIn: tokenOr(plan.tokenIn),
            tokenOut: tokenOr(tokenOutOf(plan)),
            state,
          } satisfies PlanRow;
        }),
      );
      setRows(next);
    } finally {
      setRefreshing(false);
    }
  }, [address, network, anonymizer, deployed]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const createPlan = () => {
    if (!address) return;
    if (sellToken.symbol === buyToken.symbol) {
      showError("Pick two different tokens.");
      return;
    }
    if (!quote) {
      showError("No Ekubo pool priced this pair — try a different pair or slice size.");
      return;
    }
    const price = Number(limitPrice);
    if (!Number.isFinite(price) || price <= 0) {
      showError("Set a limit price.");
      return;
    }
    const totalAmount = Number(total);
    const sliceAmount = Number(slice);
    if (!(totalAmount > 0) || !(sliceAmount > 0) || sliceAmount > totalAmount) {
      showError("Slice must be greater than zero and no larger than the total.");
      return;
    }

    const plan = buildPlan({
      tokenIn: sellToken.address,
      tokenOut: buyToken.address,
      decimalsIn: sellToken.decimals,
      decimalsOut: buyToken.decimals,
      poolKey: quote.poolKey,
      totalAmount,
      sliceAmount,
      intervalMinutes: Number(intervalMinutes) || 0,
      expiryHours: Number(expiryHours) || 24,
      limitPrice: price,
    });

    const label = `${sellToken.symbol} → ${buyToken.symbol} @ ${price}`;
    savePlan(network.key, address, plan, label);
    showSuccess("Plan committed locally. Fill a slice when the price is right.");
    void loadRows();
  };

  const fillSlice = async (row: PlanRow) => {
    if (!address) return;
    if (!deployed) {
      showError("No GhostBook anonymizer configured for this network yet.");
      return;
    }
    const progress = planProgress(row.plan, row.state, Math.floor(Date.now() / 1000));
    if (progress.expired) {
      showError("This plan has expired.");
      return;
    }
    if (progress.exhausted) {
      showError("This plan is fully filled.");
      return;
    }
    const amountIn =
      progress.remaining < row.plan.maxSlice ? progress.remaining : row.plan.maxSlice;

    setFillingHash(row.hash);
    showInfo("Confirm in your wallet. The fill reverts unless your limit price is met.");
    const result = await submit(
      fillSliceActions({
        plan: row.plan,
        anonymizer,
        ekuboRouter: network.ekuboRouter,
        amountIn,
        noteOwner: address,
      }),
    );
    setFillingHash(null);

    if (result.status === "success") {
      const event = parseSliceFilled(result.receipt, anonymizer);
      if (event) {
        showSuccess(
          `Filled ${fromSmallestUnit(event.amountIn, row.tokenIn.decimals)} ${row.tokenIn.symbol} → ${fromSmallestUnit(event.amountOut, row.tokenOut.decimals)} ${row.tokenOut.symbol}`,
        );
      } else {
        showSuccess("Transaction confirmed, but no SliceFilled event was found.");
      }
      void loadRows();
    } else if (result.error) {
      showError(result.error);
    }
  };

  const deleteRow = (hash: string) => {
    if (!address) return;
    removePlan(network.key, address, hash);
    void loadRows();
  };

  const download = () => {
    if (!address) return;
    const blob = new Blob([exportPlans(network.key, address)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ghostbook-plans-${address.slice(0, 8)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const now = Math.floor(Date.now() / 1000);

  return (
    <GhostPageShell
      title="Orders"
      subtitle="Private limit orders and TWAP, enforced on-chain"
      maxWidth="lg"
      headerRight={
        isConnected ? (
          <div className="flex items-center gap-2">
            <button
              onClick={download}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border text-[12px] hover:bg-surface-2 transition-colors"
              title="Plan terms only exist in this browser — export them"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={() => void loadRows()}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border text-[12px] hover:bg-surface-2 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        ) : null
      }
    >
      {!deployed ? (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-[12px] text-warning">
          No anonymizer address configured for {network.label}. Set
          <span className="font-mono"> NEXT_PUBLIC_ANONYMIZER_MAINNET</span> after deploying
          <span className="font-mono"> GhostBookAnonymizer</span>.
        </div>
      ) : null}

      <div className="rounded-2xl bg-surface border border-border p-4 sm:p-5">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" /> New plan
        </h2>

        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-text-secondary mb-1.5">
              Sell
            </label>
            <div className="flex gap-1.5">
              {TOKENS.map((t) => (
                <button
                  key={t.address}
                  onClick={() => setSellSymbol(t.symbol)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-[13px] transition-colors ${
                    t.symbol === sellSymbol
                      ? "border-primary bg-primary-soft"
                      : "border-border bg-surface-2 hover:border-border-hover"
                  }`}
                >
                  <TokenIcon symbol={t.symbol} size="sm" />
                  {t.symbol}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-text-secondary mb-1.5">
              Buy
            </label>
            <div className="flex gap-1.5">
              {TOKENS.map((t) => (
                <button
                  key={t.address}
                  onClick={() => setBuySymbol(t.symbol)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-[13px] transition-colors ${
                    t.symbol === buySymbol
                      ? "border-primary bg-primary-soft"
                      : "border-border bg-surface-2 hover:border-border-hover"
                  }`}
                >
                  <TokenIcon symbol={t.symbol} size="sm" />
                  {t.symbol}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-4 gap-3 mb-3">
          <Field label={`Total (${sellToken.symbol})`} value={total} onChange={setTotal} />
          <Field label={`Slice (${sellToken.symbol})`} value={slice} onChange={setSlice} />
          <Field label="Min interval (min)" value={intervalMinutes} onChange={setIntervalMinutes} />
          <Field label="Expires in (h)" value={expiryHours} onChange={setExpiryHours} />
        </div>

        <div className="mb-3">
          <label className="block text-[11px] uppercase tracking-wide text-text-secondary mb-1.5">
            Limit price — minimum {buyToken.symbol} per {sellToken.symbol}
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={limitPrice}
            onChange={(event) => setLimitPrice(event.target.value)}
            placeholder="0.0"
            className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2.5 text-lg tabular-nums outline-none focus:border-border-hover"
          />
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-text-secondary">
            <span>
              {quoting
                ? "Quoting Ekubo…"
                : quote
                  ? `Market ${Number(quote.price.toPrecision(6))} ${buyToken.symbol}/${sellToken.symbol} · ${bpsFromFee(quote.poolKey.fee)}bps pool`
                  : "No Ekubo pool priced this pair"}
            </span>
            <button onClick={() => void refreshQuote()} className="text-primary hover:underline">
              re-quote
            </button>
          </div>
        </div>

        {!isConnected ? (
          <ConnectButton />
        ) : !isSupportedNetwork ? (
          <p className="text-[12px] text-warning">Switch your wallet to Starknet Mainnet.</p>
        ) : (
          <button
            onClick={createPlan}
            className="w-full py-3 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold transition-colors"
          >
            Commit plan
          </button>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl bg-surface border border-border p-6 text-center text-[13px] text-text-secondary">
            No plans yet. A plan is committed in your browser and enforced on-chain when you fill it.
          </div>
        ) : (
          rows.map((row) => {
            const progress = planProgress(row.plan, row.state, now);
            const waitFor = Math.max(0, progress.nextFillAt - now);
            const nextSlice =
              progress.remaining < row.plan.maxSlice ? progress.remaining : row.plan.maxSlice;
            const filledPct =
              Number((row.state.filled * 100n) / (row.plan.totalAmount || 1n)) || 0;
            const price = limitPriceOf(row.plan, row.tokenIn.decimals, row.tokenOut.decimals);
            const blocked = progress.expired || progress.exhausted || waitFor > 0;

            return (
              <div key={row.hash} className="rounded-2xl bg-surface border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <TokenIcon symbol={row.tokenIn.symbol} size="sm" />
                      {row.tokenIn.symbol}
                      <span className="text-text-secondary">→</span>
                      <TokenIcon symbol={row.tokenOut.symbol} size="sm" />
                      {row.tokenOut.symbol}
                    </div>
                    <p className="text-[11px] text-text-secondary mt-1 font-mono truncate">
                      {row.hash}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteRow(row.hash)}
                    className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-surface-2 transition-colors"
                    title="Forget this plan (its remaining budget becomes unfillable)"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-[12px]">
                  <Stat label="Limit" value={`${Number(price.toPrecision(6))}`} />
                  <Stat
                    label="Filled"
                    value={`${fromSmallestUnit(row.state.filled, row.tokenIn.decimals)} / ${fromSmallestUnit(row.plan.totalAmount, row.tokenIn.decimals)}`}
                  />
                  <Stat
                    label="Received"
                    value={`${fromSmallestUnit(row.state.received, row.tokenOut.decimals)} ${row.tokenOut.symbol}`}
                  />
                  <Stat label="Fills" value={String(row.state.fills)} />
                </dl>

                <div className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, filledPct)}%` }}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-text-secondary flex items-center gap-1.5">
                    {progress.expired ? (
                      "Expired"
                    ) : progress.exhausted ? (
                      "Fully filled"
                    ) : waitFor > 0 ? (
                      <>
                        <Clock className="w-3.5 h-3.5" /> next slice in {secondsToLabel(waitFor)}
                      </>
                    ) : (
                      <>
                        Next slice {fromSmallestUnit(nextSlice, row.tokenIn.decimals)}{" "}
                        {row.tokenIn.symbol} · needs ≥{" "}
                        {fromSmallestUnit(requiredOut(row.plan, nextSlice), row.tokenOut.decimals)}{" "}
                        {row.tokenOut.symbol}
                      </>
                    )}
                  </p>
                  <button
                    onClick={() => void fillSlice(row)}
                    disabled={blocked || isBusy || !deployed}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-40 text-white text-[13px] font-semibold transition-colors"
                  >
                    {fillingHash === row.hash ? (
                      <>
                        <GhostLoader size="sm" />
                        {status === "signing" ? "Wallet…" : "Proving…"}
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" /> Fill slice
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

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

      <p className="mt-4 text-[11px] leading-relaxed text-text-secondary">
        Each fill is one private transaction: the pool withdraws a slice to the anonymizer, opens a
        note for the output, and invokes the contract, which swaps on Ekubo only if your limit price,
        slice cap, pacing and expiry all hold. The Ekubo leg is a public swap — slice amounts and
        timing are visible on-chain. What stays private is who is trading and the shape of the parent
        order. Plan terms, including the salt, live only in this browser.
      </p>
    </GhostPageShell>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-text-secondary mb-1.5">
        {label}
      </label>
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl bg-surface-2 border border-border px-3 py-2.5 text-sm tabular-nums outline-none focus:border-border-hover"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</dt>
      <dd className="mt-0.5 tabular-nums">{value}</dd>
    </div>
  );
}
