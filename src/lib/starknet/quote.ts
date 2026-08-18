/**
 * Ekubo quoting through the same router the anonymizer calls.
 *
 * Pool keys can't be derived from a pair — fee and tick spacing are part of the key — so GhostBook
 * quotes a grid of published tiers and keeps the ones the router actually prices. That doubles as
 * validation: if `quote_swap` reverts for a key, `privacy_invoke` would revert on it too.
 */

import type { RpcProvider } from "starknet";
import { num } from "starknet";
import { feeFromBps, makePoolKey, type PoolKey } from "@/lib/strk20/plan";

/** Published Ekubo (fee bps, tick spacing) tiers, cheapest first. */
export const POOL_TIERS: Array<{ bps: number; tickSpacing: number }> = [
  { bps: 0.05, tickSpacing: 200 },
  { bps: 0.05, tickSpacing: 1000 },
  { bps: 0.1, tickSpacing: 1000 },
  { bps: 0.25, tickSpacing: 1000 },
  { bps: 0.3, tickSpacing: 5982 },
  { bps: 0.5, tickSpacing: 5982 },
  { bps: 1, tickSpacing: 5982 },
  { bps: 5, tickSpacing: 5982 },
  { bps: 30, tickSpacing: 5982 },
  { bps: 100, tickSpacing: 19802 },
];

export type Quote = {
  poolKey: PoolKey;
  feeBps: number;
  amountIn: bigint;
  amountOut: bigint;
  /** Output units per input unit, decimals-adjusted. */
  price: number;
};

function i129(mag: bigint): [string, string] {
  return [num.toHex(mag), "0x0"];
}

/** Quotes one pool key. Returns null when the pool doesn't exist or can't price the amount. */
export async function quoteSwap(
  provider: RpcProvider,
  router: string,
  poolKey: PoolKey,
  tokenIn: string,
  amountIn: bigint,
): Promise<bigint | null> {
  const calldata = [
    num.toHex(poolKey.token0),
    num.toHex(poolKey.token1),
    num.toHex(poolKey.fee),
    num.toHex(poolKey.tickSpacing),
    num.toHex(poolKey.extension),
    "0x0",
    "0x0", // sqrt_ratio_limit: u256 — 0 means "swap the whole amount"
    "0x0", // skip_ahead
    num.toHex(tokenIn),
    ...i129(amountIn),
  ];
  try {
    const raw = await provider.callContract(
      { contractAddress: router, entrypoint: "quote_swap", calldata },
      "latest",
    );
    const values = (Array.isArray(raw) ? raw : (raw as { result: string[] }).result).map((v) =>
      BigInt(v),
    );
    if (values.length < 4) return null;
    // Delta { amount0: i129{mag, sign}, amount1: i129{mag, sign} } — the output leg is negative
    // from the pool's perspective, so take the magnitude of the other token.
    const [mag0, , mag1] = values;
    const inIsToken0 = BigInt(tokenIn) === BigInt(poolKey.token0);
    const out = inIsToken0 ? mag1 : mag0;
    return out > 0n ? out : null;
  } catch {
    return null;
  }
}

/**
 * Finds the tier that returns the most output for `amountIn`.
 *
 * Best output rather than lowest fee: a cheap tier with no liquidity is worse than a pricier one
 * that can actually fill.
 */
export async function findBestPool(
  provider: RpcProvider,
  router: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  decimalsIn: number,
  decimalsOut: number,
): Promise<Quote | null> {
  const quotes = await Promise.all(
    POOL_TIERS.map(async ({ bps, tickSpacing }) => {
      const poolKey = makePoolKey(tokenIn, tokenOut, feeFromBps(bps), BigInt(tickSpacing));
      const amountOut = await quoteSwap(provider, router, poolKey, tokenIn, amountIn);
      if (amountOut === null) return null;
      const price =
        (Number(amountOut) / Number(amountIn)) * 10 ** (decimalsIn - decimalsOut);
      return { poolKey, feeBps: bps, amountIn, amountOut, price } satisfies Quote;
    }),
  );

  return quotes
    .filter((q): q is Quote => q !== null)
    .sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0))[0] ?? null;
}

/** Re-quotes a known pool key, for showing the live price of an existing plan. */
export async function quoteForPlanPool(
  provider: RpcProvider,
  router: string,
  poolKey: PoolKey,
  tokenIn: string,
  amountIn: bigint,
  decimalsIn: number,
  decimalsOut: number,
): Promise<Quote | null> {
  const amountOut = await quoteSwap(provider, router, poolKey, tokenIn, amountIn);
  if (amountOut === null) return null;
  return {
    poolKey,
    feeBps: 0,
    amountIn,
    amountOut,
    price: (Number(amountOut) / Number(amountIn)) * 10 ** (decimalsIn - decimalsOut),
  };
}
