"use client";

/**
 * Token mark: a sharp monogram tile, not a coloured emoji chip.
 *
 * The brand allows exactly one accent, so tokens are differentiated by their ticker and a hairline
 * tile rather than by hue — which also means an unknown token never renders as a mystery colour.
 */

const SIZES = {
  sm: "w-5 h-5 text-[9px]",
  md: "w-7 h-7 text-[10px]",
  lg: "w-9 h-9 text-[12px]",
} as const;

export default function TokenIcon({
  symbol,
  size = "md",
  showLabel = false,
  className = "",
}: {
  symbol: string;
  size?: keyof typeof SIZES;
  showLabel?: boolean;
  className?: string;
}) {
  const ticker = (symbol || "?").trim().toUpperCase();
  const glyph = ticker.slice(0, ticker.startsWith("0X") ? 2 : 2);

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`${SIZES[size]} shrink-0 grid place-items-center border border-border bg-surface-2 mono tracking-[0.04em] text-text-secondary rounded-[2px]`}
        aria-hidden
      >
        {glyph}
      </span>
      {showLabel ? (
        <span className="mono text-[12px] tracking-[0.06em] uppercase">{ticker}</span>
      ) : null}
    </span>
  );
}
