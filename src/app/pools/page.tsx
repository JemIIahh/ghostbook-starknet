"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, ArrowUpRight, RefreshCw, Info } from "lucide-react";
import { ethers } from "ethers";
import { getCoston2RpcProvider } from "@/lib/ethereum";
import { useWallet } from "@/context/WalletContext";
import { UNISWAP_CONFIG, UNISWAP_TOKENS } from "@/lib/uniswapConfig";
import { FACTORY_ABI, POOL_ABI } from "@/lib/uniswapAbis";
import { getExplorerContractUrl } from "@/lib/constants";
import { friendlyError } from "@/lib/errors";
import { feeLabel } from "@/lib/poolMath";
import GhostPageShell from "@/components/GhostPageShell";
import TokenIcon from "@/components/TokenIcon";
import { useToast } from "@/context/ToastContext";

type PoolRow = {
  key: string;
  address: string;
  fee: number;
  token0: string;
  token1: string;
};

export default function PoolsPage() {
  const { isConnected, connect } = useWallet();
  const { showError } = useToast();
  const [pools, setPools] = useState<PoolRow[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of UNISWAP_TOKENS) {
      map[t.address.toLowerCase()] = t.symbol;
    }
    return map;
  }, []);

  const refreshPools = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const provider = getCoston2RpcProvider();
      const factory = new ethers.Contract(UNISWAP_CONFIG.factoryAddress, FACTORY_ABI, provider);
      const discovered: PoolRow[] = [];
      const fees = [500, 3000];
      for (let i = 0; i < UNISWAP_TOKENS.length; i += 1) {
        for (let j = i + 1; j < UNISWAP_TOKENS.length; j += 1) {
          const a = UNISWAP_TOKENS[i];
          const b = UNISWAP_TOKENS[j];
          for (const f of fees) {
            const poolAddress: string = await factory.pools(a.address, b.address, f);
            if (poolAddress !== ethers.ZeroAddress) {
              const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
              const [token0, token1, fee] = await Promise.all([
                pool.token0(),
                pool.token1(),
                pool.fee(),
              ]);
              const key = `${tokenMap[String(token0).toLowerCase()] ?? String(token0).slice(0, 6)} / ${
                tokenMap[String(token1).toLowerCase()] ?? String(token1).slice(0, 6)
              }`;
              discovered.push({
                key,
                address: poolAddress,
                fee: Number(fee),
                token0: String(token0),
                token1: String(token1),
              });
            }
          }
        }
      }
      if (!discovered.length && UNISWAP_CONFIG.pools.length) {
        for (const p of UNISWAP_CONFIG.pools) {
          const key = Object.keys(p)[0] ?? "pool";
          const address_ = p[key];
          const pool = new ethers.Contract(address_, POOL_ABI, provider);
          const [token0, token1, fee] = await Promise.all([
            pool.token0(),
            pool.token1(),
            pool.fee(),
          ]);
          discovered.push({
            key,
            address: address_,
            fee: Number(fee),
            token0: String(token0),
            token1: String(token1),
          });
        }
      }
      setPools(discovered);
    } catch (err: unknown) {
      const msg = friendlyError(err, "Failed to load pools.");
      setError(msg);
      showError(msg);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshPools();
  }, []);

  return (
    <GhostPageShell
      title="Pools"
      subtitle="Discover pairs · open specs · manage positions"
      maxWidth="lg"
      headerRight={
        <div className="flex items-center gap-2">
          {!isConnected && (
            <button
              onClick={connect}
              className="px-3 py-2 rounded-xl bg-surface text-text-secondary text-xs"
            >
              Connect
            </button>
          )}
          <button
            onClick={refreshPools}
            disabled={isRefreshing}
            className="px-3 py-2 rounded-xl bg-surface border border-border text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      }
    >
      <div className="rounded-3xl bg-surface border border-border p-1.5">
        <div className="rounded-2xl bg-surface-2 p-3 sm:p-4 space-y-2">
          {pools.map((pool) => {
            const detailsHref = `/pools/${pool.address}`;
            const manageHref = `/liquidity?tokenA=${pool.token0}&tokenB=${pool.token1}&fee=${pool.fee}`;
            return (
              <div
                key={pool.address}
                className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface border border-border hover:border-foreground/20 hover:bg-surface-hover transition-colors"
              >
                <Link href={detailsHref} className="min-w-0 flex-1 group">
                  <div className="flex items-center gap-2.5">
                    <div className="flex -space-x-1.5 shrink-0">
                      <TokenIcon symbol={tokenMap[pool.token0.toLowerCase()] ?? "?"} size="sm" />
                      <TokenIcon symbol={tokenMap[pool.token1.toLowerCase()] ?? "?"} size="sm" />
                    </div>
                    <div className="text-sm font-semibold tracking-tight truncate group-hover:text-primary transition-colors">
                      {pool.key}
                    </div>
                  </div>
                  <div className="text-xs text-text-tertiary mt-0.5 flex items-center gap-2 pl-[2.125rem]">
                    <span>{feeLabel(pool.fee)}</span>
                    <span className="text-text-tertiary/50">·</span>
                    <span className="font-mono truncate">
                      {pool.address.slice(0, 6)}…{pool.address.slice(-4)}
                    </span>
                  </div>
                </Link>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Link
                    href={detailsHref}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-surface-2 border border-border text-xs font-semibold text-text-secondary hover:text-foreground hover:border-foreground/20 transition-colors"
                  >
                    <Info className="w-3.5 h-3.5" />
                    Specs
                  </Link>
                  <Link
                    href={manageHref}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-semibold hover:bg-primary hover:text-white transition-colors"
                  >
                    Manage
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                  <a
                    href={getExplorerContractUrl(pool.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl text-text-tertiary hover:text-primary hover:bg-surface-2 transition-colors"
                    aria-label="View on explorer"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            );
          })}

          {!pools.length && !isRefreshing && (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm text-text-secondary">No pools found yet.</p>
              <p className="text-xs text-text-tertiary">Create a pool from Admin, then refresh.</p>
            </div>
          )}

          {isRefreshing && !pools.length && (
            <div className="py-10 text-center text-sm text-text-tertiary">Loading pools…</div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
    </GhostPageShell>
  );
}
