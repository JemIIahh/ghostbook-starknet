"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Copy,
  Check,
  ExternalLink,
  Droplets,
  RefreshCw,
  Lock,
} from "lucide-react";
import { ethers } from "ethers";
import { getCoston2RpcProvider } from "@/lib/ethereum";
import { UNISWAP_TOKENS } from "@/lib/uniswapConfig";
import { ERC20_ABI, POOL_ABI } from "@/lib/uniswapAbis";
import { getExplorerContractUrl } from "@/lib/constants";
import { formatAmount } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import {
  feeLabel,
  formatPoolPrice,
  shortAddr,
} from "@/lib/poolMath";
import GhostPageShell from "@/components/GhostPageShell";
import TokenIcon from "@/components/TokenIcon";
import { useToast } from "@/context/ToastContext";

type PoolSpec = {
  address: string;
  token0: string;
  token1: string;
  symbol0: string;
  symbol1: string;
  decimals0: number;
  decimals1: number;
  fee: number;
  tickSpacing: number;
  liquidity: string;
  sqrtPriceX96: string;
  tick: number;
  observationIndex: number;
  observationCardinality: number;
  observationCardinalityNext: number;
  reserve0: string;
  reserve1: string;
};

function SpecRow({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const { showSuccess } = useToast();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      showSuccess("Copied");
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <div className="text-xs text-text-tertiary shrink-0 pt-0.5">{label}</div>
      <div className="flex items-center gap-1.5 min-w-0 justify-end">
        <div
          className={`text-sm text-right break-all ${
            mono ? "font-mono text-[13px]" : "font-medium"
          }`}
        >
          {value}
        </div>
        {copyable ? (
          <button
            type="button"
            onClick={onCopy}
            className="p-1 rounded-lg text-text-tertiary hover:text-foreground hover:bg-surface-2 shrink-0"
            aria-label={`Copy ${label}`}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#b8ff30]" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function PoolDetailPage() {
  const params = useParams();
  const raw = String(params.address ?? "");
  const address = ethers.isAddress(raw) ? ethers.getAddress(raw) : "";
  const { showError } = useToast();

  const [spec, setSpec] = useState<PoolSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tokenMap = useMemo(() => {
    const map: Record<string, { symbol: string; decimals?: number }> = {};
    for (const t of UNISWAP_TOKENS) {
      map[t.address.toLowerCase()] = { symbol: t.symbol };
    }
    return map;
  }, []);

  const load = useCallback(async () => {
    if (!address) {
      setError("Invalid pool address.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const provider = getCoston2RpcProvider();
      const code = await provider.getCode(address);
      if (!code || code === "0x") {
        throw new Error("No contract at this address on Coston2.");
      }

      const pool = new ethers.Contract(address, POOL_ABI, provider);
      const [token0, token1, fee, tickSpacing, liquidity, slot0] = await Promise.all([
        pool.token0() as Promise<string>,
        pool.token1() as Promise<string>,
        pool.fee() as Promise<bigint>,
        pool.tickSpacing() as Promise<bigint>,
        pool.liquidity() as Promise<bigint>,
        pool.slot0() as Promise<unknown[]>,
      ]);

      const t0 = new ethers.Contract(token0, ERC20_ABI, provider);
      const t1 = new ethers.Contract(token1, ERC20_ABI, provider);
      const [sym0, sym1, dec0, dec1, bal0, bal1] = await Promise.all([
        t0.symbol().catch(() => tokenMap[token0.toLowerCase()]?.symbol ?? "???"),
        t1.symbol().catch(() => tokenMap[token1.toLowerCase()]?.symbol ?? "???"),
        t0.decimals().catch(() => 18),
        t1.decimals().catch(() => 18),
        t0.balanceOf(address) as Promise<bigint>,
        t1.balanceOf(address) as Promise<bigint>,
      ]);

      const d0 = Number(dec0);
      const d1 = Number(dec1);

      setSpec({
        address,
        token0: String(token0),
        token1: String(token1),
        symbol0: String(sym0),
        symbol1: String(sym1),
        decimals0: d0,
        decimals1: d1,
        fee: Number(fee),
        tickSpacing: Number(tickSpacing),
        liquidity: String(liquidity),
        sqrtPriceX96: String(slot0[0]),
        tick: Number(slot0[1]),
        observationIndex: Number(slot0[2]),
        observationCardinality: Number(slot0[3]),
        observationCardinalityNext: Number(slot0[4]),
        reserve0: ethers.formatUnits(bal0, d0),
        reserve1: ethers.formatUnits(bal1, d1),
      });
    } catch (err: unknown) {
      const msg = friendlyError(err, "Failed to load pool.");
      setError(msg);
      showError(msg);
      setSpec(null);
    } finally {
      setLoading(false);
    }
  }, [address, showError, tokenMap]);

  useEffect(() => {
    load();
  }, [load]);

  const prices = useMemo(() => {
    if (!spec) return null;
    return formatPoolPrice(
      BigInt(spec.sqrtPriceX96),
      spec.decimals0,
      spec.decimals1
    );
  }, [spec]);

  const liquidityHref = spec
    ? `/liquidity?tokenA=${spec.token0}&tokenB=${spec.token1}&fee=${spec.fee}`
    : "/liquidity";
  const swapHref = "/privacy";

  return (
    <GhostPageShell
      title={spec ? `${spec.symbol0} / ${spec.symbol1}` : "Pool"}
      subtitle={
        spec
          ? `${feeLabel(spec.fee)} · ${shortAddr(spec.address)}`
          : "Pool specs on Flare Coston2"
      }
      maxWidth="md"
      headerRight={
        <div className="flex items-center gap-2">
          <Link
            href="/pools"
            className="p-2 rounded-xl bg-surface border border-border text-text-secondary hover:text-foreground transition-colors"
            aria-label="Back to pools"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-surface border border-border text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      }
    >
      {loading && !spec ? (
        <div className="rounded-3xl bg-surface border border-border p-10 text-center text-sm text-text-tertiary">
          Loading pool specs…
        </div>
      ) : null}

      {error && !spec ? (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {spec ? (
        <div className="space-y-4">
          {/* Hero pair */}
          <div className="rounded-3xl bg-surface border border-border p-1.5">
            <div className="rounded-2xl bg-surface-2 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex -space-x-2">
                  <TokenIcon symbol={spec.symbol0} size="lg" />
                  <TokenIcon symbol={spec.symbol1} size="lg" />
                </div>
                <div>
                  <div className="text-xl font-semibold tracking-tight">
                    {spec.symbol0} / {spec.symbol1}
                  </div>
                  <div className="text-xs text-text-tertiary mt-0.5 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-primary/15 text-primary font-semibold">
                      {feeLabel(spec.fee)}
                    </span>
                    <span>fee tier</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-surface border border-border p-3.5">
                  <div className="text-[11px] uppercase tracking-wider text-text-tertiary mb-1">
                    Price
                  </div>
                  <div className="text-sm font-semibold">
                    1 {spec.symbol0} = {prices?.token1PerToken0 ?? "—"} {spec.symbol1}
                  </div>
                  <div className="text-xs text-text-tertiary mt-1">
                    1 {spec.symbol1} = {prices?.token0PerToken1 ?? "—"} {spec.symbol0}
                  </div>
                </div>
                <div className="rounded-2xl bg-surface border border-border p-3.5">
                  <div className="text-[11px] uppercase tracking-wider text-text-tertiary mb-1">
                    Active liquidity
                  </div>
                  <div className="text-sm font-semibold font-mono truncate">
                    {spec.liquidity}
                  </div>
                  <div className="text-xs text-text-tertiary mt-1">
                    tick {spec.tick} · spacing {spec.tickSpacing}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="rounded-2xl bg-surface border border-border p-3.5">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-tertiary mb-1">
                    <Droplets className="w-3 h-3" />
                    {spec.symbol0} reserve
                  </div>
                  <div className="text-lg font-semibold">
                    {formatAmount(spec.reserve0, 4)}
                  </div>
                </div>
                <div className="rounded-2xl bg-surface border border-border p-3.5">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-tertiary mb-1">
                    <Droplets className="w-3 h-3" />
                    {spec.symbol1} reserve
                  </div>
                  <div className="text-lg font-semibold">
                    {formatAmount(spec.reserve1, 4)}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <Link
                  href={liquidityHref}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Manage liquidity
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
                <Link
                  href={swapHref}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-surface border border-border text-sm font-semibold hover:bg-surface-hover transition-colors"
                >
                  <Lock className="w-3.5 h-3.5" />
                  TEE Swap
                </Link>
                <a
                  href={getExplorerContractUrl(spec.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-surface border border-border text-sm font-medium text-text-secondary hover:text-foreground transition-colors"
                >
                  Explorer
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Specs table */}
          <div className="rounded-3xl bg-surface border border-border p-1.5">
            <div className="rounded-2xl bg-surface-2 px-4 sm:px-5 py-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-text-tertiary pt-3 pb-1">
                Pool specs
              </div>
              <SpecRow label="Pool address" value={spec.address} mono copyable />
              <SpecRow label="Token0" value={`${spec.symbol0} · ${spec.token0}`} mono copyable />
              <SpecRow label="Token1" value={`${spec.symbol1} · ${spec.token1}`} mono copyable />
              <SpecRow label="Fee" value={`${spec.fee} (${feeLabel(spec.fee)})`} />
              <SpecRow label="Tick spacing" value={String(spec.tickSpacing)} />
              <SpecRow label="Current tick" value={String(spec.tick)} />
              <SpecRow label="Liquidity (L)" value={spec.liquidity} mono copyable />
              <SpecRow label="sqrtPriceX96" value={spec.sqrtPriceX96} mono copyable />
              <SpecRow
                label={`${spec.symbol0} in pool`}
                value={`${formatAmount(spec.reserve0, 6)} ${spec.symbol0}`}
              />
              <SpecRow
                label={`${spec.symbol1} in pool`}
                value={`${formatAmount(spec.reserve1, 6)} ${spec.symbol1}`}
              />
            </div>
          </div>

          <div className="rounded-3xl bg-surface border border-border p-1.5">
            <div className="rounded-2xl bg-surface-2 px-4 sm:px-5 py-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-text-tertiary pt-3 pb-1">
                Oracle / observations
              </div>
              <SpecRow label="Observation index" value={String(spec.observationIndex)} />
              <SpecRow
                label="Cardinality"
                value={String(spec.observationCardinality)}
              />
              <SpecRow
                label="Cardinality next"
                value={String(spec.observationCardinalityNext)}
              />
            </div>
          </div>

          <p className="text-xs text-text-tertiary px-1 leading-relaxed">
            Reserves are ERC-20 balances held by the pool contract. Price is derived from
            Uniswap V3 <span className="text-foreground">sqrtPriceX96</span>. TVL/volume
            analytics are not indexed on-chain for this demo stack.
          </p>
        </div>
      ) : null}
    </GhostPageShell>
  );
}
