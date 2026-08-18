/** Uniswap V3 sqrtPriceX96 helpers for pool UI. */

const Q96 = 2n ** 96n;

/** token1 per token0 from sqrtPriceX96 (raw float, display only). */
export function priceFromSqrtX96(sqrtPriceX96: bigint): number {
  if (sqrtPriceX96 === 0n) return 0;
  // (sqrtP / 2^96)^2
  const sqrt = Number(sqrtPriceX96) / Number(Q96);
  return sqrt * sqrt;
}

/** Format a ratio with decimals adjustment: token1/token0 human. */
export function formatPoolPrice(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number
): { token1PerToken0: string; token0PerToken1: string } {
  if (sqrtPriceX96 === 0n) {
    return { token1PerToken0: "—", token0PerToken1: "—" };
  }
  const raw = priceFromSqrtX96(sqrtPriceX96);
  const adjusted = raw * 10 ** (decimals0 - decimals1);
  const inv = adjusted === 0 ? 0 : 1 / adjusted;
  return {
    token1PerToken0: formatNice(adjusted),
    token0PerToken1: formatNice(inv),
  };
}

function formatNice(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1e6) return n.toExponential(4);
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  if (n >= 0.0001) return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
  return n.toExponential(4);
}

export function feeLabel(fee: number) {
  if (fee === 500) return "0.05%";
  if (fee === 3000) return "0.30%";
  if (fee === 10000) return "1.00%";
  return `${(fee / 10000).toFixed(2)}%`;
}

export function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
