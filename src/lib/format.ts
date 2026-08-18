/** Format a display amount to a fixed number of decimal places (default 2). */
export function formatAmount(
  value: string | number | null | undefined,
  decimals = 2
): string {
  if (value === null || value === undefined || value === "") return "--";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(decimals);
}
