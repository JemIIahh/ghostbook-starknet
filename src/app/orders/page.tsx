"use client";

/**
 * Orders — private limit orders and private TWAP/DCA.
 *
 * The plan is the product: limit price, chunk size, pacing, budget, expiry, committed once and
 * enforced by the contract on every fill. This page's job is to make that legible and to refuse
 * anything that would revert on-chain — an unfundable plan, a price the market can't meet, a chunk
 * that arrives too early.
 *
 * Plan terms live in this browser (the contract stores only the hash), so exporting them matters.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Info, RefreshCw, Trash2 } from "lucide-react";
import GhostPageShell from "@/components/GhostPageShell";
import StepGuide, { type Step } from "@/components/StepGuide";
import ConnectButton from "@/components/wallet/ConnectButton";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import {
  explorerTxUrl,
  providerFor,
  TOKENS,
  tokenByAddress,
  type TokenInfo,
} from "@/lib/starknet/config";
import { findBestPool, quoteForPlanPool, type Quote } from "@/lib/starknet/quote";
import {
  bpsFromFee,
  buildPlan,
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
import { useShieldedBalances } from "@/lib/strk20/useShieldedBalances";
import { friendlyError } from "@/lib/errors";
import { formatDuration, formatPercentDelta, formatPrice, formatToken, shortHex } from "@/lib/format";

type PlanRow = {
  hash: string;
  createdAt: number;
  plan: OrderPlan;
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  state: PlanState;
  /** Live market price for one chunk, or null when the pool can't price it. */
  marketPrice: number | null;
};

/** Limit presets, expressed the way traders think: relative to the current market. */
const PRESETS = [
  { label: "Market", premium: 0 },
  { label: "+1%", premium: 1 },
  { label: "+2%", premium: 2 },
  { label: "+5%", premium: 5 },
];

function tokenOr(address: string): TokenInfo {
  return tokenByAddress(address) ?? { symbol: "?", name: "Unknown", address, decimals: 18 };
}

export default function OrdersPage() {
  const { isConnected, address, network, isSupportedNetwork } = useWallet();
  const { showSuccess, showError, showInfo } = useToast();
  const { submit, isBusy, status, txHash } = useStrk20Submit();
  const { balanceOf, hasAnything, refresh: refreshBalances } = useShieldedBalances();

  const [sellSymbol, setSellSymbol] = useState("STRK");
  const [buySymbol, setBuySymbol] = useState("ETH");
  const [total, setTotal] = useState("10");
  const [chunks, setChunks] = useState("5");
  const [intervalMinutes, setIntervalMinutes] = useState("15");
  const [expiryHours, setExpiryHours] = useState("24");
  const [limitPrice, setLimitPrice] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [fillingHash, setFillingHash] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<string | null>(null);

  const sellToken = useMemo(
    () => TOKENS.find((t) => t.symbol === sellSymbol) ?? TOKENS[0],
    [sellSymbol],
  );
  const buyToken = useMemo(() => TOKENS.find((t) => t.symbol === buySymbol) ?? TOKENS[1], [buySymbol]);
  const anonymizer = network.anonymizer;
  const deployed = Boolean(anonymizer);

  const totalNumber = Number(total) || 0;
  const chunkCount = Math.max(1, Math.floor(Number(chunks) || 1));
  const chunkSize = totalNumber > 0 ? totalNumber / chunkCount : 0;
  const shielded = fromSmallestUnit(balanceOf(sellToken.address), sellToken.decimals);
  const underfunded = totalNumber > shielded;

  /** Quote one chunk through Ekubo so the limit starts from a real market price. */
  const refreshQuote = useCallback(async () => {
    if (sellToken.symbol === buyToken.symbol || chunkSize <= 0) {
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
        toSmallestUnit(chunkSize, sellToken.decimals),
        sellToken.decimals,
        buyToken.decimals,
      );
      setQuote(best);
      if (best && !limitPrice) setLimitPrice(formatPrice(best.price));
    } finally {
      setQuoting(false);
    }
  }, [network, sellToken, buyToken, chunkSize, limitPrice]);

  useEffect(() => {
    void refreshQuote();
    // Re-quote when the pair or chunk size changes, not on limit-price keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network.key, sellToken.address, buyToken.address, chunkSize]);

  const loadRows = useCallback(async () => {
    if (!address) {
      setRows([]);
      return;
    }
    setRefreshing(true);
    try {
      const provider = providerFor(network);
      const next = await Promise.all(
        plansWithTerms(network.key, address).map(async ({ stored, plan }) => {
          const tokenIn = tokenOr(plan.tokenIn);
          const tokenOut = tokenOr(tokenOutOf(plan));

          let state = EMPTY_PLAN_STATE;
          if (deployed) {
            try {
              state = await readPlanState(provider, anonymizer, plan);
            } catch {
              /* never filled, or the node is unreachable */
            }
          }

          // Live price for the next chunk, so the card can say whether a fill would succeed.
          let marketPrice: number | null = null;
          try {
            const live = await quoteForPlanPool(
              provider,
              network.ekuboRouter,
              plan.poolKey,
              plan.tokenIn,
              plan.maxSlice,
              tokenIn.decimals,
              tokenOut.decimals,
            );
            marketPrice = live?.price ?? null;
          } catch {
            marketPrice = null;
          }

          return {
            hash: stored.hash,
            createdAt: stored.createdAt,
            plan,
            tokenIn,
            tokenOut,
            state,
            marketPrice,
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

  const applyPreset = (premium: number) => {
    if (!quote) return;
    setLimitPrice(formatPrice(quote.price * (1 + premium / 100)));
  };

  const createPlan = () => {
    if (!address) return;
    if (sellToken.symbol === buyToken.symbol) {
      showError("Pick two different tokens.");
      return;
    }
    if (!quote) {
      showError("No Ekubo pool can price this pair right now. Try another pair.");
      return;
    }
    const price = Number(limitPrice);
    if (!Number.isFinite(price) || price <= 0) {
      showError("Set a limit price.");
      return;
    }
    if (totalNumber <= 0) {
      showError(`Enter how much ${sellToken.symbol} to sell.`);
      return;
    }
    if (underfunded) {
      showError(
        `You have ${formatToken(shielded)} ${sellToken.symbol} shielded. Shield more, or lower the amount.`,
      );
      return;
    }

    const plan = buildPlan({
      tokenIn: sellToken.address,
      tokenOut: buyToken.address,
      decimalsIn: sellToken.decimals,
      decimalsOut: buyToken.decimals,
      poolKey: quote.poolKey,
      totalAmount: totalNumber,
      sliceAmount: chunkSize,
      intervalMinutes: Number(intervalMinutes) || 0,
      expiryHours: Number(expiryHours) || 24,
      limitPrice: price,
    });

    savePlan(network.key, address, plan, `${sellToken.symbol}→${buyToken.symbol}`);
    showSuccess("Order created. Fill the first chunk when the price is right.");
    void loadRows();
  };

  const fillChunk = async (row: PlanRow) => {
    if (!address || !deployed) return;
    const progress = planProgress(row.plan, row.state, Math.floor(Date.now() / 1000));
    const amountIn = progress.remaining < row.plan.maxSlice ? progress.remaining : row.plan.maxSlice;

    setFillingHash(row.hash);
    showInfo("Confirm in your wallet. If the price slips below your limit, nothing moves.");
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
      showSuccess(
        event
          ? `Bought ${formatToken(fromSmallestUnit(event.amountOut, row.tokenOut.decimals))} ${row.tokenOut.symbol} for ${formatToken(fromSmallestUnit(event.amountIn, row.tokenIn.decimals))} ${row.tokenIn.symbol}.`
          : "Confirmed, but no fill event was found in the receipt.",
      );
      void Promise.all([loadRows(), refreshBalances()]);
    } else if (result.error) {
      showError(friendlyError(result.error));
    }
  };

  const download = () => {
    if (!address) return;
    const blob = new Blob([exportPlans(network.key, address)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ghostbook-orders-${address.slice(0, 8)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const now = Math.floor(Date.now() / 1000);

  const steps: Step[] = [
    {
      label: "Connect a wallet",
      state: isConnected ? "done" : "current",
      hint: "A Starknet wallet with STRK20 support, on Mainnet.",
    },
    {
      label: "Shield what you'll sell",
      state: !isConnected ? "todo" : hasAnything ? "done" : "current",
      hint: "Orders spend your shielded balance, not your public one.",
      href: "/private",
    },
    {
      label: "Create an order",
      state: !isConnected || !hasAnything ? "todo" : rows.length ? "done" : "current",
      hint: "Set a price you'd be happy to sell at, then fill it in chunks.",
    },
  ];

  return (
    <GhostPageShell
      eyebrow="Orders"
      title="Sell at your price, in chunks"
      subtitle="Set the terms once. Every fill is checked against them on-chain, so a chunk can only execute at your price, at your size, on your schedule."
      maxWidth="lg"
      headerRight={
        isConnected && rows.length ? (
          <div className="flex items-center gap-2">
            <button onClick={download} className="btn btn-ghost !py-2 !px-3.5" title="Back up your orders">
              <Download className="w-3.5 h-3.5" />
              Back up
            </button>
            <button
              onClick={() => void loadRows()}
              disabled={refreshing}
              className="btn btn-ghost !py-2 !px-3.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        ) : null
      }
    >
      <StepGuide steps={steps} />

      {!deployed ? (
        <div className="mt-4 flex gap-3 border border-warning/40 bg-warning/[0.06] px-5 py-4">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-[13px] leading-relaxed text-text-secondary">
            The GhostBook contract isn&apos;t deployed on {network.label} yet, so orders can be
            created but not filled.
          </p>
        </div>
      ) : null}

      {/* ── Builder ──────────────────────────────────────────────────────── */}
      <section className="mt-4 panel p-6 sm:p-8">
        <h2 className="text-[17px] font-medium">New order</h2>

        <div className="mt-6 grid sm:grid-cols-2 gap-5">
          <div>
            <label className="label">Sell</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TOKENS.map((t) => (
                <button
                  key={t.address}
                  onClick={() => setSellSymbol(t.symbol)}
                  data-active={t.symbol === sellSymbol}
                  className="chip"
                >
                  {t.symbol}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Buy</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TOKENS.map((t) => (
                <button
                  key={t.address}
                  onClick={() => setBuySymbol(t.symbol)}
                  data-active={t.symbol === buySymbol}
                  className="chip"
                >
                  {t.symbol}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <label className="label">Amount to sell</label>
            {isConnected ? (
              <button
                onClick={() => setTotal(String(shielded))}
                className="mono text-[11px] text-primary hover:underline disabled:text-text-ghost"
                disabled={shielded <= 0}
              >
                {formatToken(shielded)} {sellToken.symbol} available
              </button>
            ) : null}
          </div>
          <div className="mt-2 flex items-stretch border border-border focus-within:border-primary transition-colors">
            <input
              type="number"
              min="0"
              step="any"
              value={total}
              onChange={(event) => setTotal(event.target.value)}
              placeholder="0.00"
              className="flex-1 bg-[#101010] px-4 py-3.5 text-[22px] tabular-nums outline-none"
            />
            <span className="grid place-items-center px-4 bg-surface-2 mono text-[12px] text-text-secondary border-l border-border">
              {sellToken.symbol}
            </span>
          </div>
          {underfunded && isConnected ? (
            <p className="mt-2 text-[12px] text-warning">
              More than your shielded balance. Shield more {sellToken.symbol} first.
            </p>
          ) : null}
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <label className="label">Minimum price</label>
            <span className="hint">
              {quoting
                ? "Checking the market…"
                : quote
                  ? `Market: ${formatPrice(quote.price)} ${buyToken.symbol} per ${sellToken.symbol}`
                  : "No pool can price this pair"}
            </span>
          </div>
          <div className="mt-2 flex items-stretch border border-border focus-within:border-primary transition-colors">
            <input
              type="number"
              min="0"
              step="any"
              value={limitPrice}
              onChange={(event) => setLimitPrice(event.target.value)}
              placeholder="0.00"
              className="flex-1 bg-[#101010] px-4 py-3.5 text-[22px] tabular-nums outline-none"
            />
            <span className="grid place-items-center px-4 bg-surface-2 mono text-[12px] text-text-secondary border-l border-border whitespace-nowrap">
              {buyToken.symbol} / {sellToken.symbol}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset.premium)}
                disabled={!quote}
                className="chip !py-1.5 !px-2.5 disabled:opacity-40"
              >
                {preset.label}
              </button>
            ))}
            {quote && Number(limitPrice) > 0 ? (
              <span className="hint">
                {formatPercentDelta(Number(limitPrice), quote.price)} vs market
              </span>
            ) : null}
          </div>
        </div>

        <details className="mt-6 border-t border-line-subtle pt-5">
          <summary className="label cursor-pointer select-none">Split and timing</summary>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Field label="Chunks" value={chunks} onChange={setChunks} hint="Fills to split it into" />
            <Field
              label="Wait between"
              value={intervalMinutes}
              onChange={setIntervalMinutes}
              hint="Minutes, enforced"
            />
            <Field label="Expires in" value={expiryHours} onChange={setExpiryHours} hint="Hours" />
          </div>
        </details>

        {/* Plain-English restatement of exactly what the contract will enforce. */}
        <div className="mt-6 border border-border bg-[#101010] px-5 py-4">
          <div className="flex gap-2.5">
            <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-1" />
            <p className="text-[13px] leading-relaxed">
              {totalNumber > 0 && Number(limitPrice) > 0 ? (
                <>
                  Sell <strong>{formatToken(totalNumber)} {sellToken.symbol}</strong> in{" "}
                  <strong>{chunkCount}</strong> {chunkCount === 1 ? "fill" : "fills"} of{" "}
                  {formatToken(chunkSize)} {sellToken.symbol}, never below{" "}
                  <strong>
                    {formatPrice(Number(limitPrice))} {buyToken.symbol}
                  </strong>{" "}
                  each, at most one every {intervalMinutes || 0} min, expiring in{" "}
                  {expiryHours || 24} h. Total if every fill lands at your price:{" "}
                  <strong>
                    {formatToken(totalNumber * Number(limitPrice))} {buyToken.symbol}
                  </strong>
                  .
                </>
              ) : (
                "Set an amount and a minimum price to see what this order will do."
              )}
            </p>
          </div>
        </div>

        <div className="mt-6">
          {!isConnected ? (
            <ConnectButton />
          ) : !isSupportedNetwork ? (
            <p className="text-[13px] text-warning">Switch your wallet to Starknet Mainnet.</p>
          ) : (
            <button
              onClick={createPlan}
              disabled={underfunded || !quote || totalNumber <= 0 || Number(limitPrice) <= 0}
              className="btn btn-orange w-full sm:w-auto"
            >
              Create order
            </button>
          )}
        </div>
      </section>

      {/* ── Open orders ──────────────────────────────────────────────────── */}
      {rows.length ? (
        <section className="mt-8">
          <h2 className="text-[17px] font-medium">Your orders</h2>

          <div className="mt-4 space-y-3">
            {rows.map((row) => {
              const progress = planProgress(row.plan, row.state, now);
              const waitFor = Math.max(0, progress.nextFillAt - now);
              const nextChunk =
                progress.remaining < row.plan.maxSlice ? progress.remaining : row.plan.maxSlice;
              const pct = Number((row.state.filled * 1000n) / (row.plan.totalAmount || 1n)) / 10;
              const limit = limitPriceOf(row.plan, row.tokenIn.decimals, row.tokenOut.decimals);
              const priceMet = row.marketPrice !== null && row.marketPrice >= limit;

              const reason = progress.expired
                ? "Expired"
                : progress.exhausted
                  ? "Filled"
                  : waitFor > 0
                    ? `Next fill in ${formatDuration(waitFor)}`
                    : row.marketPrice === null
                      ? "No price available"
                      : priceMet
                        ? "Price met — ready to fill"
                        : `Waiting for ${formatPrice(limit)} (market ${formatPrice(row.marketPrice)})`;

              const canFill =
                deployed && !progress.expired && !progress.exhausted && waitFor === 0 && priceMet;

              return (
                <article key={row.hash} className="panel-flat p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-[16px] font-medium">
                        Sell {formatToken(fromSmallestUnit(row.plan.totalAmount, row.tokenIn.decimals))}{" "}
                        {row.tokenIn.symbol} for {row.tokenOut.symbol}
                      </p>
                      <p className="mt-1.5 text-[13px] text-text-secondary">
                        at {formatPrice(limit)} {row.tokenOut.symbol} or better ·{" "}
                        {formatToken(fromSmallestUnit(row.plan.maxSlice, row.tokenIn.decimals))}{" "}
                        {row.tokenIn.symbol} per fill
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (!address) return;
                        removePlan(network.key, address, row.hash);
                        void loadRows();
                      }}
                      className="p-1.5 text-text-ghost hover:text-danger transition-colors"
                      title="Remove — any unfilled amount can no longer be filled"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="mt-5 flex items-center gap-3">
                    <div className="meter flex-1">
                      <span style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <span className="mono text-[11px] text-text-secondary tabular-nums shrink-0">
                      {pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] text-text-tertiary">
                    {formatToken(fromSmallestUnit(row.state.filled, row.tokenIn.decimals))} of{" "}
                    {formatToken(fromSmallestUnit(row.plan.totalAmount, row.tokenIn.decimals))}{" "}
                    {row.tokenIn.symbol} sold
                    {row.state.received > 0n ? (
                      <>
                        {" · "}
                        {formatToken(fromSmallestUnit(row.state.received, row.tokenOut.decimals))}{" "}
                        {row.tokenOut.symbol} received
                      </>
                    ) : null}
                  </p>

                  <div className="mt-5 pt-5 border-t border-line-subtle flex items-center justify-between gap-4 flex-wrap">
                    <p className="text-[13px] flex items-center gap-2">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          canFill
                            ? "bg-primary pulse-dot"
                            : progress.expired || progress.exhausted
                              ? "bg-text-ghost"
                              : "bg-warning"
                        }`}
                      />
                      <span className={canFill ? "text-foreground" : "text-text-secondary"}>
                        {reason}
                      </span>
                    </p>
                    <button
                      onClick={() => void fillChunk(row)}
                      disabled={!canFill || isBusy}
                      className="btn btn-orange"
                      title={canFill ? undefined : reason}
                    >
                      {fillingHash === row.hash
                        ? status === "signing"
                          ? "Waiting for wallet…"
                          : "Filling…"
                        : `Fill ${formatToken(fromSmallestUnit(nextChunk, row.tokenIn.decimals))} ${row.tokenIn.symbol}`}
                    </button>
                  </div>

                  <button
                    onClick={() => setShowDetails(showDetails === row.hash ? null : row.hash)}
                    className="mt-4 hint hover:text-text-secondary transition-colors"
                  >
                    {showDetails === row.hash ? "Hide details" : "Details"}
                  </button>
                  {showDetails === row.hash ? (
                    <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
                      <Detail label="Fills so far" value={String(row.state.fills)} />
                      <Detail
                        label="Minimum per fill"
                        value={`${formatToken(fromSmallestUnit(requiredOut(row.plan, nextChunk), row.tokenOut.decimals))} ${row.tokenOut.symbol}`}
                      />
                      <Detail
                        label="Wait between fills"
                        value={formatDuration(Number(row.plan.minInterval))}
                      />
                      <Detail
                        label="Expires"
                        value={new Date(Number(row.plan.expiry) * 1000).toLocaleString()}
                      />
                      <Detail label="Ekubo pool" value={`${bpsFromFee(row.plan.poolKey.fee)} bps`} />
                      <Detail label="On-chain id" value={shortHex(row.hash, 10, 6)} />
                    </dl>
                  ) : null}
                </article>
              );
            })}
          </div>

          <p className="mt-5 hint">
            Orders are stored in this browser only — the contract keeps just their id. Use{" "}
            <strong className="text-text-secondary">Back up</strong> if you clear site data or switch
            device, or the unfilled amount becomes unreachable.
          </p>
        </section>
      ) : null}

      {txHash ? (
        <a
          href={explorerTxUrl(network, txHash)}
          target="_blank"
          rel="noreferrer"
          className="mt-5 block mono text-[11px] text-primary hover:underline truncate"
        >
          View transaction {shortHex(txHash, 10, 6)} ↗
        </a>
      ) : null}
    </GhostPageShell>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field mono text-[14px] mt-2"
      />
      {hint ? <p className="mt-1.5 hint">{hint}</p> : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line-subtle pb-1.5">
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="mono tabular-nums text-text-secondary">{value}</dd>
    </div>
  );
}
