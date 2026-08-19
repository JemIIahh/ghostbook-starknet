"use client";

/**
 * Orders — private limit orders, filled in slices.
 *
 * The plan is the product: limit price, slice size, pacing, budget and expiry are committed once as
 * `poseidon(plan)` and re-checked by the anonymizer on every fill. This page's job is to make those
 * terms legible and to refuse anything that would revert on-chain — an unfundable plan, a price the
 * market can't meet, a slice that arrives too early.
 *
 * Plan terms live in this browser (the contract stores only the hash), so backing them up matters.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  X,
} from "lucide-react";
import GhostPageShell from "@/components/GhostPageShell";
import TokenIcon from "@/components/TokenIcon";
import ConnectButton from "@/components/wallet/ConnectButton";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import {
  explorerTxUrl,
  providerFor,
  tokenBySymbol,
  tokenByAddress,
  type TokenInfo,
} from "@/lib/starknet/config";
import { findBestPool, quoteForPlanPool, type Quote } from "@/lib/starknet/quote";
import {
  bpsFromFee,
  buildPlan,
  fromSmallestUnit,
  limitPriceOf,
  planHash,
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

type OrderType = "limit" | "market";
type Side = "BUY" | "SELL";
type Filter = "all" | "active" | "matched";

/** Pairs with deep Ekubo liquidity, quoted the way a trader reads them: base / quote. */
const PAIR_PRESETS: Array<[TokenInfo, TokenInfo]> = [
  [tokenBySymbol("STRK")!, tokenBySymbol("ETH")!],
  [tokenBySymbol("ETH")!, tokenBySymbol("USDC")!],
];

/** Limit presets, expressed the way traders think: relative to the current market. */
const PRESETS = [
  { label: "Market", premium: 0 },
  { label: "+1%", premium: 1 },
  { label: "+2%", premium: 2 },
  { label: "+5%", premium: 5 },
];

/** A market order commits a limit just under the live quote, so it fills now but not at any price. */
const MARKET_TOLERANCE = 0.01;

type PlanRow = {
  hash: string;
  createdAt: number;
  type: OrderType;
  side: Side;
  plan: OrderPlan;
  /** What the plan sells and buys. */
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  /** How the pair reads in the UI. */
  base: TokenInfo;
  quote: TokenInfo;
  state: PlanState;
  /** Live market price for one slice, in quote per base, or null when the pool can't price it. */
  marketPrice: number | null;
};

function tokenOr(address: string): TokenInfo {
  return tokenByAddress(address) ?? { symbol: "?", name: "Unknown", address, decimals: 18 };
}

function sameToken(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

/**
 * Reads a plan back as a pair + side.
 *
 * The contract only ever sells `token_in` for `token_out`, so BUY/SELL is purely a presentation
 * choice: it says which leg the user thinks of as the base. Presets define that, and an unknown pair
 * falls back to reading the sold token as the base.
 */
function pairOf(tokenIn: TokenInfo, tokenOut: TokenInfo): { base: TokenInfo; quote: TokenInfo; side: Side } {
  for (const [base, quote] of PAIR_PRESETS) {
    if (sameToken(tokenIn.address, base.address) && sameToken(tokenOut.address, quote.address)) {
      return { base, quote, side: "SELL" };
    }
    if (sameToken(tokenIn.address, quote.address) && sameToken(tokenOut.address, base.address)) {
      return { base, quote, side: "BUY" };
    }
  }
  return { base: tokenIn, quote: tokenOut, side: "SELL" };
}

export default function OrdersPage() {
  const { isConnected, address, network, isSupportedNetwork } = useWallet();
  const { showSuccess, showError, showInfo } = useToast();
  const { submit, isBusy, status, txHash } = useStrk20Submit();
  const { balanceOf, refresh: refreshBalances } = useShieldedBalances();

  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [side, setSide] = useState<Side>("SELL");
  const [base, setBase] = useState<TokenInfo>(PAIR_PRESETS[0][0]);
  const [quote, setQuote] = useState<TokenInfo>(PAIR_PRESETS[0][1]);
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [chunks, setChunks] = useState("1");
  const [intervalMinutes, setIntervalMinutes] = useState("0");
  const [expiryHours, setExpiryHours] = useState("24");
  const [marketQuote, setMarketQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [fillingHash, setFillingHash] = useState<string | null>(null);
  const [openDetails, setOpenDetails] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pair = `${base.symbol}/${quote.symbol}`;
  const anonymizer = network.anonymizer;
  const deployed = Boolean(anonymizer);

  /** SELL sells the base; BUY sells the quote. The contract only knows `token_in`. */
  const tokenIn = side === "SELL" ? base : quote;
  const tokenOut = side === "SELL" ? quote : base;

  const priceNumber = Number(price);
  const amountNumber = Number(amount);
  const hasPrice = Number.isFinite(priceNumber) && priceNumber > 0;
  const hasAmount = Number.isFinite(amountNumber) && amountNumber > 0;
  const chunkCount = Math.max(1, Math.floor(Number(chunks) || 1));

  /** Total input, in the sold token: SELL spends base, BUY spends price × amount of quote. */
  const totalIn = useMemo(() => {
    if (!hasAmount) return 0;
    if (side === "SELL") return amountNumber;
    return hasPrice ? amountNumber * priceNumber : 0;
  }, [side, amountNumber, priceNumber, hasAmount, hasPrice]);

  const shielded = fromSmallestUnit(balanceOf(tokenIn.address), tokenIn.decimals);
  const underfunded = isConnected && totalIn > shielded;

  /** Live market price, in quote per base — the direction the form displays. */
  const marketPrice = useMemo(() => {
    if (!marketQuote) return null;
    return side === "SELL" ? marketQuote.price : 1 / marketQuote.price;
  }, [marketQuote, side]);

  /** Quote one slice through Ekubo so the limit starts from a real price. */
  const refreshQuote = useCallback(async () => {
    const sliceIn = totalIn > 0 ? totalIn / chunkCount : 0;
    // Quote a nominal slice when the form is empty, so the market price shows before typing.
    const probe = sliceIn > 0 ? sliceIn : 1;
    setQuoting(true);
    try {
      setMarketQuote(
        await findBestPool(
          providerFor(network),
          network.ekuboRouter,
          tokenIn.address,
          tokenOut.address,
          toSmallestUnit(probe, tokenIn.decimals),
          tokenIn.decimals,
          tokenOut.decimals,
        ),
      );
    } finally {
      setQuoting(false);
    }
  }, [network, tokenIn, tokenOut, totalIn, chunkCount]);

  useEffect(() => {
    void refreshQuote();
    // Re-quote on pair / side / size changes, not on limit-price keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network.key, tokenIn.address, tokenOut.address, chunkCount]);

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
          const rowIn = tokenOr(plan.tokenIn);
          const rowOut = tokenOr(tokenOutOf(plan));
          const pairing = pairOf(rowIn, rowOut);

          let state = EMPTY_PLAN_STATE;
          if (deployed) {
            try {
              state = await readPlanState(provider, anonymizer, plan);
            } catch {
              /* never filled, or the node is unreachable */
            }
          }

          // Live price for the next slice, so the row can say whether a fill would succeed.
          let live: number | null = null;
          try {
            const quoted = await quoteForPlanPool(
              provider,
              network.ekuboRouter,
              plan.poolKey,
              plan.tokenIn,
              plan.maxSlice,
              rowIn.decimals,
              rowOut.decimals,
            );
            live = quoted?.price ?? null;
          } catch {
            live = null;
          }

          return {
            hash: stored.hash,
            createdAt: stored.createdAt,
            type: stored.label === "market" ? "market" : "limit",
            side: pairing.side,
            plan,
            tokenIn: rowIn,
            tokenOut: rowOut,
            base: pairing.base,
            quote: pairing.quote,
            state,
            marketPrice:
              live === null ? null : pairing.side === "SELL" ? live : 1 / live,
          } satisfies PlanRow;
        }),
      );
      setRows(next.sort((a, b) => b.createdAt - a.createdAt));
    } finally {
      setRefreshing(false);
    }
  }, [address, network, anonymizer, deployed]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const applyPreset = (premium: number) => {
    if (marketPrice === null) return;
    setPrice(formatPrice(marketPrice * (1 + premium / 100)));
  };

  /** One slice, as a single private transaction. */
  const fillSlice = async (row: {
    hash: string;
    plan: OrderPlan;
    tokenIn: TokenInfo;
    tokenOut: TokenInfo;
    state: PlanState;
  }) => {
    if (!address || !deployed) return;
    const progress = planProgress(row.plan, row.state, Math.floor(Date.now() / 1000));
    const amountIn =
      progress.remaining > 0n && progress.remaining < row.plan.maxSlice
        ? progress.remaining
        : row.plan.maxSlice;

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
      const message = friendlyError(result.error);
      setError(message);
      showError(message);
    }
  };

  const placeOrder = async () => {
    if (!address) return;
    setError(null);

    if (sameToken(base.address, quote.address)) {
      setError("Pick two different tokens.");
      return;
    }
    if (!hasAmount) {
      setError(`Enter how much ${base.symbol} to trade.`);
      return;
    }
    if (!marketQuote || marketPrice === null) {
      setError("No Ekubo pool can price this pair right now.");
      return;
    }
    if (orderType === "limit" && !hasPrice) {
      setError("Set a limit price.");
      return;
    }

    // Market: commit just under the live quote and fill it in one slice.
    const displayPrice = orderType === "market" ? marketPrice * (1 - MARKET_TOLERANCE) : priceNumber;
    const slices = orderType === "market" ? 1 : chunkCount;
    const total = side === "SELL" ? amountNumber : amountNumber * displayPrice;

    if (total > shielded) {
      setError(
        `You have ${formatToken(shielded)} ${tokenIn.symbol} in your private balance. Shield more, or lower the amount.`,
      );
      return;
    }

    // `limitPrice` is output units per input unit; the form quotes quote-per-base.
    const limitPrice = side === "SELL" ? displayPrice : 1 / displayPrice;

    const plan = buildPlan({
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      decimalsIn: tokenIn.decimals,
      decimalsOut: tokenOut.decimals,
      poolKey: marketQuote.poolKey,
      totalAmount: total,
      sliceAmount: total / slices,
      intervalMinutes: orderType === "market" ? 0 : Number(intervalMinutes) || 0,
      expiryHours: orderType === "market" ? 1 : Number(expiryHours) || 24,
      limitPrice,
    });

    setIsPlacing(true);
    try {
      savePlan(network.key, address, plan, orderType);
      if (orderType === "market") {
        await fillSlice({
          hash: planHash(plan),
          plan,
          tokenIn,
          tokenOut,
          state: EMPTY_PLAN_STATE,
        });
      } else {
        showSuccess("Order committed. Fill a slice when the price is right.");
      }
      setAmount("");
      if (orderType === "limit") setPrice("");
      await loadRows();
    } finally {
      setIsPlacing(false);
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

  const decorated = rows.map((row) => {
    const progress = planProgress(row.plan, row.state, now);
    const waitFor = Math.max(0, progress.nextFillAt - now);
    const nextSlice =
      progress.remaining > 0n && progress.remaining < row.plan.maxSlice
        ? progress.remaining
        : row.plan.maxSlice;
    const limit = limitPriceOf(row.plan, row.tokenIn.decimals, row.tokenOut.decimals);
    const displayLimit = row.side === "SELL" ? limit : 1 / limit;
    const priceMet = row.marketPrice !== null && row.marketPrice >= displayLimit;

    const reason = !deployed
      ? "Contract not deployed on this network"
      : progress.expired
        ? "Expired"
        : progress.exhausted
          ? "Fully filled"
          : waitFor > 0
            ? `Next fill in ${formatDuration(waitFor)}`
            : row.marketPrice === null
              ? "No price available"
              : priceMet
                ? "Price met — ready to fill"
                : `Waiting for ${formatPrice(displayLimit)} (market ${formatPrice(row.marketPrice)})`;

    const statusLabel: "filled" | "expired" | "matched" | "active" = progress.exhausted
      ? "filled"
      : progress.expired
        ? "expired"
        : row.state.fills > 0
          ? "matched"
          : "active";

    return {
      row,
      progress,
      waitFor,
      nextSlice,
      displayLimit,
      priceMet,
      reason,
      statusLabel,
      canFill:
        deployed && !progress.expired && !progress.exhausted && waitFor === 0 && priceMet,
      pct:
        row.plan.totalAmount > 0n
          ? Number((row.state.filled * 1000n) / row.plan.totalAmount) / 10
          : 0,
    };
  });

  const filtered = decorated.filter((entry) => {
    if (filter === "all") return true;
    if (filter === "matched") return entry.row.state.fills > 0;
    return !entry.progress.expired && !entry.progress.exhausted;
  });

  const canSubmit = hasAmount && (orderType === "market" || hasPrice) && !underfunded;

  const primaryLabel = isPlacing
    ? orderType === "market"
      ? "Filling…"
      : "Committing…"
    : !hasAmount
      ? "Enter an amount"
      : orderType === "limit" && !hasPrice
        ? "Enter price & amount"
        : underfunded
          ? `Not enough private ${tokenIn.symbol}`
          : orderType === "market"
            ? `Market ${side.toLowerCase()}`
            : `Commit ${side.toLowerCase()} order`;

  return (
    <GhostPageShell
      title="Orders"
      subtitle={`${pair} · committed on-chain, filled through Ekubo`}
      maxWidth="lg"
      headerRight={
        <div className="flex items-center gap-1.5">
          {isConnected && rows.length ? (
            <>
              <button
                type="button"
                onClick={download}
                className="p-2 rounded-xl bg-surface text-text-secondary border border-border hover:text-foreground hover:bg-surface-hover transition-colors"
                aria-label="Back up orders"
                title="Back up your orders"
              >
                <Download className="w-[18px] h-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => void loadRows()}
                disabled={refreshing}
                className="p-2 rounded-xl bg-surface text-text-secondary border border-border hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-50"
                aria-label="Refresh orders"
              >
                <RefreshCw className={`w-[18px] h-[18px] ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </>
          ) : null}
          <div className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-primary-soft text-primary border-primary/30 inline-flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> STRK20
          </div>
        </div>
      }
    >
      {!deployed ? (
        <div className="mb-4 rounded-2xl bg-warning/10 border border-warning/20 p-4 flex gap-2.5 text-sm">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-text-secondary leading-relaxed">
            The GhostBook anonymizer isn&apos;t deployed on {network.label} yet, so orders can be
            committed but not filled.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col lg:flex-row gap-5">
        {/* ── Builder ────────────────────────────────────────────────────── */}
        <div className="lg:w-[380px] shrink-0">
          <div className="rounded-3xl bg-surface border border-border p-5 lg:sticky lg:top-[88px]">
            <h2 className="text-lg font-semibold mb-4">
              {orderType === "limit" ? "New limit order" : "New market order"}
            </h2>

            {/* Order type */}
            <div className="flex gap-1.5 p-1 rounded-2xl bg-surface-2 mb-3">
              {(
                [
                  { id: "limit" as const, label: "Limit" },
                  { id: "market" as const, label: "Market" },
                ]
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setOrderType(t.id);
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    orderType === t.id
                      ? "bg-surface text-foreground border border-border"
                      : "text-text-secondary hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Side */}
            <div className="flex gap-1.5 p-1 rounded-2xl bg-surface-2 mb-4">
              {(["BUY", "SELL"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSide(s);
                    setError(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    side === s
                      ? s === "BUY"
                        ? "bg-success text-white"
                        : "bg-danger text-white"
                      : "text-text-secondary hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Pair */}
            <div className="mb-4 space-y-2">
              <div className="flex gap-1.5 p-1 rounded-2xl bg-surface-2">
                {PAIR_PRESETS.map(([b, q]) => {
                  const active =
                    sameToken(base.address, b.address) && sameToken(quote.address, q.address);
                  return (
                    <button
                      key={`${b.symbol}-${q.symbol}`}
                      type="button"
                      onClick={() => {
                        setBase(b);
                        setQuote(q);
                        setPrice("");
                      }}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                        active
                          ? "bg-surface text-foreground border border-border"
                          : "text-text-secondary hover:text-foreground"
                      }`}
                    >
                      <span className="flex -space-x-1.5">
                        <TokenIcon symbol={b.symbol} size="sm" className="scale-[0.8]" />
                        <TokenIcon symbol={q.symbol} size="sm" className="scale-[0.8]" />
                      </span>
                      {b.symbol}/{q.symbol}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-2">
                <div className="flex -space-x-2">
                  <TokenIcon symbol={base.symbol} size="sm" />
                  <TokenIcon symbol={quote.symbol} size="sm" />
                </div>
                <span className="font-semibold text-sm">
                  {base.symbol} / {quote.symbol}
                </span>
                <span className="ml-auto text-xs text-text-tertiary">
                  {quoting ? "Quoting…" : marketPrice !== null ? formatPrice(marketPrice) : "No pool"}
                </span>
              </div>
            </div>

            {/* Price — limit only */}
            {orderType === "limit" && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm text-text-tertiary mb-1.5">
                  <span>Price ({quote.symbol})</span>
                  <span className="flex items-center gap-1">
                    <Lock className="w-3 h-3 text-primary" /> Committed
                  </span>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-surface-2 border border-border text-lg font-medium focus:outline-none focus:border-border-hover transition-colors"
                />
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset.premium)}
                      disabled={marketPrice === null}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-2 text-text-secondary hover:text-foreground transition-colors disabled:opacity-40"
                    >
                      {preset.label}
                    </button>
                  ))}
                  {marketPrice !== null && hasPrice ? (
                    <span className="text-[11px] text-text-tertiary">
                      {formatPercentDelta(priceNumber, marketPrice)} vs market
                    </span>
                  ) : null}
                </div>
              </div>
            )}

            {/* Amount */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm text-text-tertiary mb-1.5">
                <span>Amount ({base.symbol})</span>
                {isConnected ? (
                  <button
                    type="button"
                    onClick={() =>
                      setAmount(
                        String(
                          side === "SELL"
                            ? shielded
                            : hasPrice
                              ? shielded / priceNumber
                              : shielded,
                        ),
                      )
                    }
                    disabled={shielded <= 0}
                    className="text-xs hover:text-foreground transition-colors disabled:opacity-50"
                    title="Use your full private balance"
                  >
                    {formatToken(shielded)} {tokenIn.symbol} private
                  </button>
                ) : (
                  <span className="text-primary text-xs font-medium capitalize">{orderType}</span>
                )}
              </div>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-3.5 rounded-2xl bg-surface-2 border border-border text-lg font-medium focus:outline-none focus:border-border-hover transition-colors"
              />
              {underfunded ? (
                <p className="mt-1.5 text-xs text-warning">
                  Needs {formatToken(totalIn)} {tokenIn.symbol}; you have{" "}
                  {formatToken(shielded)}.{" "}
                  <Link href="/balance" className="text-primary hover:underline">
                    Shield more →
                  </Link>
                </p>
              ) : null}
            </div>

            {/* Split and timing — limit only; a market order is one immediate slice. */}
            {orderType === "limit" ? (
              <details className="mb-4 rounded-2xl bg-surface-2 px-3.5 py-3">
                <summary className="text-sm text-text-secondary cursor-pointer select-none">
                  Split and timing
                </summary>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Field label="Slices" value={chunks} onChange={setChunks} />
                  <Field label="Wait (min)" value={intervalMinutes} onChange={setIntervalMinutes} />
                  <Field label="Expiry (h)" value={expiryHours} onChange={setExpiryHours} />
                </div>
                <p className="mt-2 text-[11px] text-text-tertiary leading-relaxed">
                  The contract refuses a slice that is too large, or that arrives before the wait has
                  elapsed.
                </p>
              </details>
            ) : null}

            {/* Plain-English restatement of exactly what the contract will enforce. */}
            <div className="p-3 rounded-2xl bg-surface-2 mb-4 flex gap-2.5">
              <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-text-secondary leading-relaxed">
                {hasAmount && (orderType === "market" || hasPrice) && marketPrice !== null ? (
                  orderType === "market" ? (
                    <>
                      {side === "BUY" ? "Buy" : "Sell"}{" "}
                      <span className="text-foreground font-medium">
                        {formatToken(amountNumber)} {base.symbol}
                      </span>{" "}
                      now at about {formatPrice(marketPrice)} {quote.symbol}, spending{" "}
                      {formatToken(totalIn)} {tokenIn.symbol}. Committed price is 1% under the live
                      quote, so it reverts rather than filling into a moving market.
                    </>
                  ) : (
                    <>
                      {side === "BUY" ? "Buy" : "Sell"}{" "}
                      <span className="text-foreground font-medium">
                        {formatToken(amountNumber)} {base.symbol}
                      </span>{" "}
                      at{" "}
                      <span className="text-foreground font-medium">
                        {formatPrice(priceNumber)} {quote.symbol}
                      </span>{" "}
                      or better, in {chunkCount} {chunkCount === 1 ? "slice" : "slices"}, at most one
                      every {Number(intervalMinutes) || 0} min, expiring in{" "}
                      {Number(expiryHours) || 24} h. Spends up to {formatToken(totalIn)}{" "}
                      {tokenIn.symbol}.
                    </>
                  )
                ) : (
                  "Set an amount and a price to see exactly what the contract will enforce."
                )}
              </p>
            </div>

            {/* Submit */}
            {!isConnected ? (
              <ConnectButton variant="full" />
            ) : !isSupportedNetwork ? (
              <p className="text-sm text-warning text-center">
                Switch your wallet to Starknet Mainnet.
              </p>
            ) : (
              <button
                onClick={() => void placeOrder()}
                disabled={!canSubmit || isPlacing || isBusy}
                className={`w-full py-3.5 rounded-2xl text-[15px] font-semibold transition-colors flex items-center justify-center gap-2 ${
                  !canSubmit
                    ? "bg-surface-2 text-text-tertiary cursor-not-allowed"
                    : side === "BUY"
                      ? "bg-success hover:bg-success/90 text-white"
                      : "bg-danger hover:bg-danger/90 text-white"
                } disabled:opacity-60`}
              >
                {isPlacing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {primaryLabel}
              </button>
            )}

            {error && (
              <div className="mt-2 p-2.5 rounded-xl bg-danger/10 text-danger text-xs text-center">
                {error}
              </div>
            )}

            {txHash && (
              <div className="mt-2 flex items-center justify-center gap-2 text-xs">
                <span className="text-text-tertiary">Tx:</span>
                <a
                  href={explorerTxUrl(network, txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 font-mono"
                >
                  {shortHex(txHash, 10, 6)} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            <p className="text-xs text-text-tertiary mt-3 text-center leading-relaxed">
              {orderType === "limit"
                ? "Only the fingerprint of your terms goes on-chain; the terms stay in this browser."
                : "One slice, filled immediately, settling into your private balance."}
            </p>
          </div>
        </div>

        {/* ── Orders list ────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1 bg-surface rounded-2xl p-1">
              {(["all", "active", "matched"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`px-3.5 py-1.5 rounded-xl text-sm font-medium capitalize transition-colors ${
                    filter === t
                      ? "bg-surface-2 text-foreground"
                      : "text-text-secondary hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <span className="text-sm text-text-tertiary">{filtered.length} orders</span>
          </div>

          <div className="space-y-2">
            <AnimatePresence>
              {filtered.map((entry) => {
                const { row, progress, nextSlice, displayLimit, reason, statusLabel, canFill, pct } =
                  entry;
                const soldBase =
                  row.side === "SELL"
                    ? fromSmallestUnit(row.plan.totalAmount, row.tokenIn.decimals)
                    : fromSmallestUnit(row.plan.totalAmount, row.tokenIn.decimals) / displayLimit;

                return (
                  <motion.div
                    key={row.hash}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`p-4 rounded-2xl bg-surface border border-border ${
                      statusLabel === "expired" ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            row.side === "BUY"
                              ? "bg-success/12 text-success"
                              : "bg-danger/12 text-danger"
                          }`}
                        >
                          {row.side}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-surface-2 text-text-secondary capitalize">
                          {row.type}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-1.5">
                            <TokenIcon symbol={row.base.symbol} size="sm" />
                            <TokenIcon symbol={row.quote.symbol} size="sm" />
                          </div>
                          <span className="text-sm font-semibold">
                            {row.base.symbol}/{row.quote.symbol}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            statusLabel === "active"
                              ? "bg-success/10 text-success"
                              : statusLabel === "matched"
                                ? "bg-primary-soft text-primary"
                                : "bg-surface-2 text-text-tertiary"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <span className="text-xs text-text-tertiary shrink-0">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex gap-8">
                        <div>
                          <div className="text-[11px] text-text-tertiary uppercase tracking-wider mb-0.5">
                            Price
                          </div>
                          <span className="text-sm font-mono">
                            {formatPrice(displayLimit)} {row.quote.symbol}
                          </span>
                        </div>
                        <div>
                          <div className="text-[11px] text-text-tertiary uppercase tracking-wider mb-0.5">
                            Amount
                          </div>
                          <span className="text-sm font-mono">
                            {formatToken(soldBase)} {row.base.symbol}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={!canFill || isBusy}
                          onClick={() => void fillSlice(row)}
                          title={canFill ? undefined : reason}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-primary/15 text-primary border border-primary/25 hover:bg-primary hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-primary/15 disabled:hover:text-primary"
                        >
                          {fillingHash === row.hash
                            ? status === "signing"
                              ? "Confirm…"
                              : "Filling…"
                            : `Fill ${formatToken(fromSmallestUnit(nextSlice, row.tokenIn.decimals))} ${row.tokenIn.symbol}`}
                        </button>
                        <button
                          onClick={() =>
                            setOpenDetails(openDetails === row.hash ? null : row.hash)
                          }
                          className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors text-[11px] text-text-tertiary hover:text-foreground"
                        >
                          {openDetails === row.hash ? "Hide" : "Details"}
                        </button>
                        <button
                          onClick={() => {
                            if (!address) return;
                            removePlan(network.key, address, row.hash);
                            void loadRows();
                          }}
                          title="Remove — any unfilled amount can no longer be filled"
                          className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
                        >
                          <X className="w-4 h-4 text-text-tertiary hover:text-danger" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono text-text-tertiary shrink-0">
                        {pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%
                      </span>
                    </div>
                    <p className="mt-2 text-xs flex items-center gap-2">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          canFill
                            ? "bg-success"
                            : progress.expired || progress.exhausted
                              ? "bg-text-tertiary"
                              : "bg-warning"
                        }`}
                      />
                      <span className={canFill ? "text-foreground" : "text-text-secondary"}>
                        {reason}
                      </span>
                    </p>

                    {openDetails === row.hash ? (
                      <dl className="mt-3 pt-3 border-t border-border grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                        <Detail
                          label="Sold so far"
                          value={`${formatToken(fromSmallestUnit(row.state.filled, row.tokenIn.decimals))} / ${formatToken(fromSmallestUnit(row.plan.totalAmount, row.tokenIn.decimals))} ${row.tokenIn.symbol}`}
                        />
                        <Detail
                          label="Received"
                          value={`${formatToken(fromSmallestUnit(row.state.received, row.tokenOut.decimals))} ${row.tokenOut.symbol}`}
                        />
                        <Detail label="Fills" value={String(row.state.fills)} />
                        <Detail
                          label="Minimum next fill"
                          value={`${formatToken(fromSmallestUnit(requiredOut(row.plan, nextSlice), row.tokenOut.decimals))} ${row.tokenOut.symbol}`}
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
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16 text-text-tertiary">
              <Lock className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No {filter === "all" ? "" : filter} orders</p>
            </div>
          )}

          {rows.length ? (
            <p className="mt-5 text-xs text-text-tertiary leading-relaxed">
              Orders live in this browser only — the contract keeps just their id. Back them up
              before you clear site data or switch device, or the unfilled amount becomes
              unreachable.
            </p>
          ) : null}
        </div>
      </div>
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
    <label className="block">
      <span className="block text-[11px] text-text-tertiary mb-1">{label}</span>
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-2 rounded-xl bg-surface border border-border text-sm font-mono focus:outline-none focus:border-border-hover transition-colors"
      />
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="font-mono text-text-secondary">{value}</dd>
    </div>
  );
}
