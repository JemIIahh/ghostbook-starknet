/** Display formatting. Amounts and prices here span 18 decimals to 6, so precision is adaptive. */

/**
 * Formats a token amount for reading, not for accounting.
 *
 * Small values keep significant digits (an ETH price of 0.0000117 must not round to 0.00), large
 * values get thousands separators and stop at two decimals.
 */
export function formatToken(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";

  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (abs >= 1) return trimZeros(value.toFixed(4));
  if (abs >= 0.0001) return trimZeros(value.toFixed(6));
  return trimZeros(value.toPrecision(3));
}

/** A price, which needs one more digit of resolution than a balance. */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (abs >= 1) return trimZeros(value.toFixed(4));
  return trimZeros(value.toPrecision(4));
}

/** Percentage difference of `value` against `reference`, e.g. +2.4%. */
export function formatPercentDelta(value: number, reference: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference === 0) return "—";
  const delta = ((value - reference) / reference) * 100;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(Math.abs(delta) < 10 ? 1 : 0)}%`;
}

/** Short, human duration: "45s", "12 min", "3 h", "2 days". */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "now";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} days`;
}

/** Truncated address / hash for display. */
export function shortHex(value: string, lead = 6, tail = 4): string {
  return value.length <= lead + tail + 2 ? value : `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

function trimZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** @deprecated use formatToken — kept for callers that want a fixed 2dp string. */
export function formatAmount(
  value: string | number | null | undefined,
  decimals = 2,
): string {
  if (value === null || value === undefined || value === "") return "--";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(decimals);
}
