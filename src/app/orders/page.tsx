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
import { Download, RefreshCw, Trash2 } from "lucide-react";
import GhostPageShell from "@/components/GhostPageShell";
import TokenIcon from "@/components/TokenIcon";
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
import { findBestPool, type Quote } from "@/lib/starknet/quote";
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
import { friendlyError } from "@/lib/errors";

type PlanRow = {
  hash: string;
  label: string;
  createdAt: number;
  plan: OrderPlan;
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  state: PlanState;
};

function tokenOr(address: string): TokenInfo {
  return tokenByAddress(address) ?? { symbol: "?", name: "Unknown", address, decimals: 18 };
}

function countdown(seconds: number): string {
  if (seconds <= 0) return "ready";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  return `${Math.ceil(seconds / 3600)}h`;
}

function trimNumber(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return "—";
  return String(Number(value.toPrecision(digits)));
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

  const sellToken = useMemo(
    () => TOKENS.find((t) => t.symbol === sellSymbol) ?? TOKENS[0],
    [sellSymbol],
  );
  const buyToken = useMemo(() => TOKENS.find((t) => t.symbol === buySymbol) ?? TOKENS[1], [buySymbol]);
  const anonymizer = network.anonymizer;
  const deployed = Boolean(anonymizer);

  /** Quote the slice through Ekubo so the limit price starts from a real market price. */
  const refreshQuote = useCallback(async () => {
    const sliceAmount = Number(slice);
    if (sellToken.symbol === buyToken.symbol || !Number.isFinite(sliceAmount) || sliceAmount <= 0) {
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
      if (best && !limitPrice) setLimitPrice(trimNumber(best.price));
    } finally {
      setQuoting(false);
    }
  }, [network, sellToken, buyToken, slice, limitPrice]);

  useEffect(() => {
    void refreshQuote();
    // Re-quote on pair / slice changes only, not on limit-price keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network.key, sellToken.address, buyToken.address, slice]);

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
          let state = EMPTY_PLAN_STATE;
          if (deployed) {
            try {
              state = await readPlanState(provider, anonymizer, plan);
            } catch {
              /* unreachable node or never-filled plan */
            }
          }
          return {
            hash: stored.hash,
            label: stored.label,
            createdAt: stored.createdAt,
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
      showError("No Ekubo pool priced this pair — try another pair or slice size.");
      return;
    }
    const price = Number(limitPrice);
    const totalAmount = Number(total);
    const sliceAmount = Number(slice);
    if (!Number.isFinite(price) || price <= 0) {
      showError("Set a limit price.");
      return;
    }
    if (!(totalAmount > 0) || !(sliceAmount > 0) || sliceAmount > totalAmount) {
      showError("Slice must be above zero and no larger than the total.");
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

    savePlan(
      network.key,
      address,
      plan,
      `${sellToken.symbol}→${buyToken.symbol} @ ${trimNumber(price)}`,
    );
    showSuccess("Plan committed. Fill a slice whenever the price allows.");
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
    const amountIn = progress.remaining < row.plan.maxSlice ? progress.remaining : row.plan.maxSlice;

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
      showSuccess(
        event
          ? `Filled ${fromSmallestUnit(event.amountIn, row.tokenIn.decimals)} ${row.tokenIn.symbol} → ${fromSmallestUnit(event.amountOut, row.tokenOut.decimals)} ${row.tokenOut.symbol}`
          : "Confirmed, but no SliceFilled event was found in the receipt.",
      );
      void loadRows();
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
    link.download = `ghostbook-plans-${address.slice(0, 8)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const now = Math.floor(Date.now() / 1000);

  return (
    <GhostPageShell
      eyebrow="Orders"
      title="Commit terms. Fill in slices."
      subtitle="Your plan is hashed with a secret salt and enforced by the anonymizer on every fill: limit price, slice cap, total budget, pacing, expiry."
      maxWidth="lg"
      headerRight={
        isConnected ? (
          <div className="flex items-center gap-2">
            <button
              onClick={download}
              className="btn btn-ghost !py-2 !px-3.5"
              title="Plan terms exist only in this browser"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={() => void loadRows()}
              disabled={refreshing}
              className="btn btn-ghost !py-2 !px-3.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Sync
            </button>
          </div>
        ) : null
      }
    >
      {!deployed ? (
        <div className="mb-4 border border-warning/40 bg-warning/[0.07] px-5 py-4">
          <p className="tag text-warning">[ Not deployed ]</p>
          <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">
            No anonymizer configured for {network.label}. Deploy it with{" "}
            <code className="mono text-primary">scripts/deploy-anonymizer.sh</code> and set{" "}
            <code className="mono text-primary">NEXT_PUBLIC_ANONYMIZER_MAINNET</code>. You can still
            build plans — fills need the contract.
          </p>
        </div>
      ) : null}

      {/* ── Builder ──────────────────────────────────────────────────────── */}
      <section className="panel p-6 sm:p-8">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <p className="tag">[ New plan ]</p>
          <p className="mono text-[10px] tracking-[0.18em] uppercase text-text-tertiary">
            {quoting
              ? "Quoting Ekubo…"
              : quote
                ? `Market ${trimNumber(quote.price)} · ${bpsFromFee(quote.poolKey.fee)}bps pool`
                : "No pool priced"}
          </p>
        </div>

        <div className="mt-6 grid md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-5 items-end">
          <div>
            <p className="label">Sell</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
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
          <span className="hidden md:block text-primary pb-2.5" aria-hidden>
            →
          </span>
          <div>
            <p className="label">Buy</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
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

        <div className="mt-7">
          <div className="flex items-baseline justify-between">
            <p className="label">
              Limit — minimum {buyToken.symbol} per {sellToken.symbol}
            </p>
            <button
              onClick={() => void refreshQuote()}
              className="mono text-[10px] tracking-[0.16em] uppercase text-primary hover:underline"
            >
              re-quote
            </button>
          </div>
          <input
            type="number"
            min="0"
            step="any"
            value={limitPrice}
            onChange={(event) => setLimitPrice(event.target.value)}
            placeholder="0.00"
            className="mt-2.5 w-full bg-[#101010] border border-border focus:border-primary transition-colors px-4 py-4 display text-[clamp(26px,3vw,38px)] tabular-nums outline-none"
          />
          {quote ? (
            <p className="mt-2 text-[11px] text-text-tertiary">
              A slice of {slice} {sellToken.symbol} currently quotes{" "}
              {trimNumber(fromSmallestUnit(quote.amountOut, buyToken.decimals))} {buyToken.symbol}.
              Set your limit above market to wait for a better price.
            </p>
          ) : null}
        </div>

        <div className="mt-7 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label={`Total ${sellToken.symbol}`} value={total} onChange={setTotal} />
          <Field label={`Slice ${sellToken.symbol}`} value={slice} onChange={setSlice} />
          <Field label="Interval (min)" value={intervalMinutes} onChange={setIntervalMinutes} />
          <Field label="Expires (h)" value={expiryHours} onChange={setExpiryHours} />
        </div>

        <div className="mt-7 pt-6 border-t border-line-subtle flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[11px] leading-relaxed text-text-tertiary max-w-[52ch]">
            {Number(total) > 0 && Number(slice) > 0
              ? `${Math.ceil(Number(total) / Number(slice))} slices, at least ${intervalMinutes || 0} minutes apart.`
              : "Set a total and slice size."}
          </p>
          {!isConnected ? (
            <ConnectButton />
          ) : !isSupportedNetwork ? (
            <p className="mono text-[11px] tracking-[0.12em] uppercase text-warning">
              Switch to Starknet Mainnet
            </p>
          ) : (
            <button onClick={createPlan} className="btn btn-orange">
              Commit plan →
            </button>
          )}
        </div>
      </section>

      {/* ── Plans ────────────────────────────────────────────────────────── */}
      <section className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <div className="panel-flat px-6 py-14 text-center">
            <p className="mono text-[11px] tracking-[0.22em] uppercase text-text-ghost">
              No plans yet
            </p>
            <p className="mt-3 text-[13px] text-text-secondary max-w-[46ch] mx-auto leading-relaxed">
              A plan is committed in your browser and enforced on-chain the moment you fill it.
            </p>
          </div>
        ) : (
          rows.map((row) => {
            const progress = planProgress(row.plan, row.state, now);
            const waitFor = Math.max(0, progress.nextFillAt - now);
            const nextSlice =
              progress.remaining < row.plan.maxSlice ? progress.remaining : row.plan.maxSlice;
            const pct = Number((row.state.filled * 1000n) / (row.plan.totalAmount || 1n)) / 10;
            const price = limitPriceOf(row.plan, row.tokenIn.decimals, row.tokenOut.decimals);
            const blocked = progress.expired || progress.exhausted || waitFor > 0;
            const statusLabel = progress.expired
              ? "Expired"
              : progress.exhausted
                ? "Complete"
                : waitFor > 0
                  ? `Paced · ${countdown(waitFor)}`
                  : "Fillable";

            return (
              <article key={row.hash} className="panel p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <TokenIcon symbol={row.tokenIn.symbol} size="sm" showLabel />
                      <span className="text-primary" aria-hidden>
                        →
                      </span>
                      <TokenIcon symbol={row.tokenOut.symbol} size="sm" showLabel />
                    </div>
                    <p className="mt-2.5 mono text-[10px] text-text-ghost truncate max-w-[46ch]">
                      {row.hash}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`mono text-[10px] tracking-[0.18em] uppercase px-2.5 py-1 border rounded-full ${
                        statusLabel === "Fillable"
                          ? "text-primary border-primary/50"
                          : "text-text-tertiary border-border"
                      }`}
                    >
                      {statusLabel}
                    </span>
                    <button
                      onClick={() => {
                        removePlan(network.key, address!, row.hash);
                        void loadRows();
                      }}
                      className="p-1.5 text-text-ghost hover:text-danger transition-colors"
                      title="Forget this plan — its remaining budget becomes unfillable"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border">
                  <Cell label="Limit" value={trimNumber(price)} note={`${row.tokenOut.symbol}/${row.tokenIn.symbol}`} />
                  <Cell
                    label="Filled"
                    value={`${pct.toFixed(pct < 10 ? 1 : 0)}%`}
                    note={`${fromSmallestUnit(row.state.filled, row.tokenIn.decimals)} of ${fromSmallestUnit(row.plan.totalAmount, row.tokenIn.decimals)}`}
                  />
                  <Cell
                    label="Received"
                    value={trimNumber(fromSmallestUnit(row.state.received, row.tokenOut.decimals))}
                    note={row.tokenOut.symbol}
                  />
                  <Cell label="Fills" value={String(row.state.fills)} note="slices settled" />
                </div>

                <div className="meter mt-5">
                  <span style={{ width: `${Math.min(100, pct)}%` }} />
                </div>

                <div className="mt-5 flex items-end justify-between gap-4 flex-wrap">
                  <p className="text-[12px] leading-relaxed text-text-secondary max-w-[52ch]">
                    {progress.expired ? (
                      "Past expiry — the contract refuses further fills."
                    ) : progress.exhausted ? (
                      "Budget spent. Every slice settled into your notes."
                    ) : waitFor > 0 ? (
                      `Pacing holds the next slice for ${countdown(waitFor)}.`
                    ) : (
                      <>
                        Next slice{" "}
                        <span className="text-foreground">
                          {fromSmallestUnit(nextSlice, row.tokenIn.decimals)} {row.tokenIn.symbol}
                        </span>{" "}
                        needs at least{" "}
                        <span className="text-foreground">
                          {trimNumber(
                            fromSmallestUnit(requiredOut(row.plan, nextSlice), row.tokenOut.decimals),
                          )}{" "}
                          {row.tokenOut.symbol}
                        </span>
                        .
                      </>
                    )}
                  </p>
                  <button
                    onClick={() => void fillSlice(row)}
                    disabled={blocked || isBusy || !deployed}
                    className="btn btn-orange"
                  >
                    {fillingHash === row.hash
                      ? status === "signing"
                        ? "Wallet…"
                        : "Proving…"
                      : "Fill slice →"}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>

      {txHash ? (
        <a
          href={explorerTxUrl(network, txHash)}
          target="_blank"
          rel="noreferrer"
          className="mt-5 block mono text-[11px] text-primary hover:underline truncate"
        >
          {txHash} ↗
        </a>
      ) : null}

      <p className="mt-8 text-[11px] leading-relaxed text-text-tertiary max-w-[86ch]">
        Each fill is one private transaction: the pool withdraws a slice to the anonymizer, opens a
        note for the output, and invokes the contract, which swaps on Ekubo only if the limit price,
        slice cap, pacing and expiry all hold. The Ekubo leg is a public swap — slice amounts and
        timing are visible. What stays private is who is trading and the shape of the parent order.
        Plan terms, including the salt, live only in this browser: export them.
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
      <p className="label">{label}</p>
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field mono text-[14px] mt-2.5"
      />
    </div>
  );
}

function Cell({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-background px-4 py-4">
      <p className="label">{label}</p>
      <p className="display mt-2 text-[clamp(18px,2vw,26px)] tabular-nums">{value}</p>
      <p className="mt-1 mono text-[10px] tracking-[0.12em] uppercase text-text-ghost truncate">
        {note}
      </p>
    </div>
  );
}
