"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Eye, EyeOff, Loader2, X, ExternalLink, Shield } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import TokenIcon, { getTokenEmoji } from "@/components/TokenIcon";
import GhostPageShell from "@/components/GhostPageShell";
import { getExplorerTxUrl } from "@/lib/constants";
import { UNISWAP_TOKENS, type UniswapToken } from "@/lib/uniswapConfig";
import { useToast } from "@/context/ToastContext";
import { formatAmount } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import {
  cancelTeeIntent,
  executeTeeTrade,
  settleTeeIntent,
} from "@/lib/privacy/trade";

const FEE = 3000;
const STORAGE_KEY = "ghostbook.orders.v2";

/** Common pairs shown in the orders UI */
const PAIR_PRESETS: [UniswapToken, UniswapToken][] = [
  [UNISWAP_TOKENS[0], UNISWAP_TOKENS[1]], // GHOST/BOOK
  [
    UNISWAP_TOKENS.find((t) => t.key === "fxrp")!,
    UNISWAP_TOKENS.find((t) => t.key === "usdt0")!,
  ], // FXRP/USDT0
];

type OrderType = "limit" | "market";
type Side = "BUY" | "SELL";

interface Order {
  id: string;
  type: OrderType;
  side: Side;
  pair: string;
  baseSymbol: string;
  quoteSymbol: string;
  price: string;
  amount: string;
  status: "active" | "matched" | "cancelled";
  time: string;
  revealed: boolean;
  txHash?: string;
  /** PrivacyRouter intent id (TEE escrow) */
  intentId?: string;
}

function loadOrders(address?: string | null): Order[] {
  if (typeof window === "undefined" || !address) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${address.toLowerCase()}`);
    return raw ? (JSON.parse(raw) as Order[]) : [];
  } catch {
    return [];
  }
}

function saveOrders(address: string, orders: Order[]) {
  localStorage.setItem(`${STORAGE_KEY}:${address.toLowerCase()}`, JSON.stringify(orders));
}

export default function OrdersPage() {
  const { isConnected, connect, address } = useWallet();
  const { showSuccess, showError } = useToast();

  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [side, setSide] = useState<Side>("BUY");
  const [base, setBase] = useState<UniswapToken>(PAIR_PRESETS[0][0]);
  const [quote, setQuote] = useState<UniswapToken>(PAIR_PRESETS[0][1]);
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [isPlacing, setIsPlacing] = useState(false);
  const [tab, setTab] = useState<"all" | "active" | "matched">("all");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  const pair = `${base.symbol}/${quote.symbol}`;
  const tokenIn = side === "SELL" ? base : quote;
  const tokenOut = side === "SELL" ? quote : base;

  useEffect(() => {
    setOrders(loadOrders(address));
  }, [address]);

  useEffect(() => {
    if (address) saveOrders(address, orders);
  }, [orders, address]);

  const amountInLabel = useMemo(() => {
    if (orderType === "market") {
      return side === "SELL" ? `Amount (${base.symbol})` : `Amount (${quote.symbol})`;
    }
    return `Amount (${base.symbol})`;
  }, [orderType, side, base.symbol, quote.symbol]);

  const canSubmit = useMemo(() => {
    if (!amount || Number(amount) <= 0) return false;
    if (orderType === "limit" && (!price || Number(price) <= 0)) return false;
    return true;
  }, [amount, price, orderType]);

  const totalDisplay = useMemo(() => {
    if (orderType === "limit" && price && amount) {
      const t = parseFloat(price) * parseFloat(amount);
      if (!Number.isFinite(t)) return null;
      return `${formatAmount(t)} ${quote.symbol}`;
    }
    return null;
  }, [orderType, price, amount, quote.symbol]);

  const handlePlaceOrder = async () => {
    if (!canSubmit || !isConnected || !address) {
      if (!isConnected) connect();
      return;
    }
    setIsPlacing(true);
    setTxHash(null);
    setError(null);
    try {
      // Market: amount is tokenIn. Limit BUY: amount is base to buy → pay quote = price*amount
      // Limit SELL: amount is base to sell (tokenIn = base)
      let amountInHuman = amount;
      let amountOutMinHuman: string | undefined;

      if (orderType === "limit") {
        if (side === "BUY") {
          // Pay quote, receive base. Escrow quote amount = price * amount
          const pay = parseFloat(price) * parseFloat(amount);
          if (!Number.isFinite(pay) || pay <= 0) throw new Error("Invalid limit total");
          amountInHuman = String(pay);
          // minOut = base amount at limit
          amountOutMinHuman = amount;
        } else {
          // Sell base for quote; minOut = price * amount
          amountInHuman = amount;
          const receive = parseFloat(price) * parseFloat(amount);
          if (!Number.isFinite(receive) || receive <= 0) throw new Error("Invalid limit total");
          amountOutMinHuman = String(receive);
        }
      }

      const result = await executeTeeTrade({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountInHuman,
        amountOutMinHuman,
        fee: FEE,
        recipient: address,
        mode: orderType === "market" ? "market" : "limit",
        slippagePct: "0.5",
      });

      const hash = result.settleTxHash || result.escrowTxHash;
      setTxHash(hash);

      const next: Order = {
        id: result.intentId,
        type: orderType,
        side,
        pair,
        baseSymbol: base.symbol,
        quoteSymbol: quote.symbol,
        price: orderType === "market" ? "Market" : price,
        amount,
        status: result.status === "matched" ? "matched" : "active",
        time: "Just now",
        revealed: orderType === "market",
        txHash: hash,
        intentId: result.intentId,
      };
      setOrders((prev) => [next, ...prev]);
      showSuccess(
        orderType === "market"
          ? `TEE market ${side.toLowerCase()} settled · #${result.intentId}`
          : `TEE limit escrowed · intent #${result.intentId}`
      );
      setAmount("");
      setPrice("");
    } catch (err: unknown) {
      const msg = friendlyError(err, "Failed to place TEE order.");
      setError(msg);
      showError(msg);
    } finally {
      setIsPlacing(false);
    }
  };

  const cancelOrder = async (id: string) => {
    const order = orders.find((o) => o.id === id);
    try {
      if (order?.intentId && order.status === "active") {
        const hash = await cancelTeeIntent(order.intentId);
        setTxHash(hash);
      }
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: "cancelled" as const } : o))
      );
      showSuccess("TEE order cancelled · escrow returned");
    } catch (err: unknown) {
      showError(friendlyError(err, "Cancel failed"));
    }
  };

  const fillLimit = async (id: string) => {
    const order = orders.find((o) => o.id === id);
    if (!order?.intentId) return;
    setIsPlacing(true);
    try {
      const { settleTxHash } = await settleTeeIntent(order.intentId);
      setTxHash(settleTxHash);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === id
            ? {
                ...o,
                status: "matched" as const,
                revealed: true,
                txHash: settleTxHash,
              }
            : o
        )
      );
      showSuccess(`TEE filled intent #${order.intentId}`);
    } catch (err: unknown) {
      showError(friendlyError(err, "TEE fill failed — limit may be unmet"));
    } finally {
      setIsPlacing(false);
    }
  };

  const toggleReveal = (id: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, revealed: !o.revealed } : o))
    );
  };

  const filtered = orders.filter((o) => (tab === "all" ? true : o.status === tab));

  const primaryLabel = !isConnected
    ? "Connect Wallet"
    : isPlacing
      ? orderType === "market"
        ? "TEE settling…"
        : "TEE escrowing…"
      : !canSubmit
        ? orderType === "limit"
          ? "Enter price & amount"
          : "Enter an amount"
        : orderType === "market"
          ? `TEE market ${side.toLowerCase()}`
          : (
              <>
                <Lock className="w-4 h-4" /> TEE sealed {side.toLowerCase()}
              </>
            );

  return (
    <GhostPageShell
      title="Orders"
      subtitle={`${pair} · TEE sealed market & limit`}
      maxWidth="lg"
      headerRight={
        <div className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-[#b8ff30]/15 text-[#b8ff30] border-[#b8ff30]/30 inline-flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" /> TEE only
        </div>
      }
    >
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Create order — original sealed UI preserved */}
        <div className="lg:w-[380px] shrink-0">
          <div className="rounded-3xl bg-surface border border-border p-5 lg:sticky lg:top-[88px]">
            <h2 className="text-lg font-semibold mb-4">
              {orderType === "limit" ? "New sealed order" : "New market order"}
            </h2>

            {/* Order type */}
            <div className="flex gap-1.5 p-1 rounded-2xl bg-surface-2 mb-3">
              {([
                { id: "limit" as const, label: "Limit" },
                { id: "market" as const, label: "Market" },
              ]).map((t) => (
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
                  onClick={() => setSide(s)}
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

            {/* Pair display */}
            <div className="mb-4 space-y-2">
              <div className="flex gap-1.5 p-1 rounded-2xl bg-surface-2">
                {PAIR_PRESETS.map(([b, q]) => {
                  const active = base.address === b.address && quote.address === q.address;
                  return (
                    <button
                      key={`${b.symbol}-${q.symbol}`}
                      type="button"
                      onClick={() => {
                        setBase(b);
                        setQuote(q);
                      }}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                          active
                            ? "bg-surface text-foreground border border-border"
                            : "text-text-secondary hover:text-foreground"
                        }`}
                    >
                      {getTokenEmoji(b.symbol)} {b.symbol}/{getTokenEmoji(q.symbol)} {q.symbol}
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
              </div>
            </div>

            {/* Price — limit only (sealed UI) */}
            {orderType === "limit" && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm text-text-tertiary mb-1.5">
                  <span>Price ({quote.symbol})</span>
                  <span className="flex items-center gap-1">
                    <Lock className="w-3 h-3 text-primary" /> Sealed
                  </span>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-surface-2 border border-border text-lg font-medium focus:outline-none focus:border-border-hover transition-colors"
                />
              </div>
            )}

            {/* Amount */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm text-text-tertiary mb-1.5">
                <span>{amountInLabel}</span>
                {orderType === "limit" ? (
                  <span className="flex items-center gap-1">
                    <Lock className="w-3 h-3 text-primary" /> Sealed
                  </span>
                ) : (
                  <span className="text-primary text-xs font-medium">Market</span>
                )}
              </div>
              <input
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-3.5 rounded-2xl bg-surface-2 border border-border text-lg font-medium focus:outline-none focus:border-border-hover transition-colors"
              />
            </div>

            {/* Total */}
            {totalDisplay && (
              <div className="p-3 rounded-xl bg-surface-2 flex justify-between text-sm mb-4">
                <span className="text-text-secondary">Total</span>
                <span className="font-mono">{totalDisplay}</span>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={isConnected ? handlePlaceOrder : connect}
              disabled={isConnected && (!canSubmit || isPlacing)}
              className={`w-full py-3.5 rounded-2xl text-[15px] font-semibold transition-colors flex items-center justify-center gap-2 ${
                !isConnected
                  ? "bg-primary-soft text-primary hover:bg-primary/20"
                  : !canSubmit
                    ? "bg-surface-2 text-text-tertiary cursor-not-allowed"
                    : side === "BUY"
                      ? "bg-success hover:bg-success/90 text-white"
                      : "bg-danger hover:bg-danger/90 text-white"
              } disabled:opacity-60`}
            >
              {isPlacing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />{" "}
                  {orderType === "market" ? "TEE settling..." : "TEE escrowing..."}
                </>
              ) : (
                primaryLabel
              )}
            </button>

            {error && (
              <div className="mt-2 p-2.5 rounded-xl bg-danger/10 text-danger text-xs text-center">
                {error}
              </div>
            )}

            {txHash && (
              <div className="mt-2 flex items-center justify-center gap-2 text-xs">
                <span className="text-text-tertiary">Tx:</span>
                <a
                  href={getExplorerTxUrl(txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 font-mono"
                >
                  {txHash.slice(0, 10)}...{txHash.slice(-6)}{" "}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            <p className="text-xs text-text-tertiary mt-3 text-center">
              {orderType === "limit"
                ? "Limit stays sealed in TEE escrow until fill or cancel"
                : "Market: encrypt → escrow → TEE match → settle"}
            </p>
          </div>
        </div>

        {/* Orders list — original UI */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1 bg-surface rounded-2xl p-1">
              {(["all", "active", "matched"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3.5 py-1.5 rounded-xl text-sm font-medium capitalize transition-colors ${
                    tab === t
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
              {filtered.map((order) => (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`p-4 rounded-2xl bg-surface border border-border ${
                    order.status === "cancelled" ? "opacity-40" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                          order.side === "BUY"
                            ? "bg-success/12 text-success"
                            : "bg-danger/12 text-danger"
                        }`}
                      >
                        {order.side}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-surface-2 text-text-secondary capitalize">
                        {order.type}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-1.5">
                          <TokenIcon symbol={order.baseSymbol} size="sm" />
                          <TokenIcon symbol={order.quoteSymbol} size="sm" />
                        </div>
                        <span className="text-sm font-semibold">{order.pair}</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          order.status === "active"
                            ? "bg-success/10 text-success"
                            : order.status === "matched"
                              ? "bg-primary-soft text-primary"
                              : "bg-surface-2 text-text-tertiary"
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                    <span className="text-xs text-text-tertiary shrink-0">{order.time}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-8">
                      <div>
                        <div className="text-[11px] text-text-tertiary uppercase tracking-wider mb-0.5">
                          Price
                        </div>
                        {order.type === "market" || order.revealed ? (
                          <span className="text-sm font-mono">{order.price}</span>
                        ) : (
                          <span className="text-sm text-text-tertiary flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Sealed
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="text-[11px] text-text-tertiary uppercase tracking-wider mb-0.5">
                          Amount
                        </div>
                        {order.type === "market" || order.revealed ? (
                          <span className="text-sm font-mono">{formatAmount(order.amount)}</span>
                        ) : (
                          <span className="text-sm text-text-tertiary flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Sealed
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {order.status === "active" && order.intentId && (
                        <button
                          type="button"
                          disabled={isPlacing}
                          onClick={() => fillLimit(order.id)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-primary/15 text-primary border border-primary/25 hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
                        >
                          TEE fill
                        </button>
                      )}
                      {order.type === "limit" && (
                        <button
                          onClick={() => toggleReveal(order.id)}
                          className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
                        >
                          {order.revealed ? (
                            <EyeOff className="w-4 h-4 text-text-tertiary" />
                          ) : (
                            <Eye className="w-4 h-4 text-primary" />
                          )}
                        </button>
                      )}
                      {order.txHash && (
                        <a
                          href={getExplorerTxUrl(order.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4 text-text-tertiary" />
                        </a>
                      )}
                      {order.status === "active" && (
                        <button
                          onClick={() => cancelOrder(order.id)}
                          className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
                        >
                          <X className="w-4 h-4 text-text-tertiary hover:text-danger" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16 text-text-tertiary">
              <Lock className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No {tab === "all" ? "" : tab} orders</p>
            </div>
          )}
        </div>
      </div>
    </GhostPageShell>
  );
}
