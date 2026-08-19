"use client";

/**
 * Token marks.
 *
 * These are inline vectors rather than remote images on purpose: no network request per icon, crisp
 * at any size, no broken images if a CDN changes, and nothing about which tokens a user is looking
 * at leaves the browser. Each mark carries its own brand-coloured disc, so the chip needs no
 * background of its own.
 *
 * The predecessor used emoji, which was fine when the tokens were invented (GHOST, BOOK). STRK, ETH
 * and USDC are real assets with recognisable marks, and a 💎 standing in for Ether reads as
 * unfinished.
 *
 * Unknown symbols fall back to a neutral disc with the ticker, which is honest — better than
 * implying an identity we don't have.
 */

type MarkProps = { title: string };

/** Ether: the canonical octahedron, white on Ethereum's brand violet. */
function EthMark({ title }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full" role="img" aria-label={title}>
      <title>{title}</title>
      <circle cx="16" cy="16" r="16" fill="#627EEA" />
      <path d="M16.5 4v8.87l7.5 3.35z" fill="#fff" fillOpacity=".602" />
      <path d="M16.5 4L9 16.22l7.5-3.35z" fill="#fff" />
      <path d="M16.5 21.97v6.02L24 17.62z" fill="#fff" fillOpacity=".602" />
      <path d="M16.5 27.99v-6.03L9 17.62z" fill="#fff" />
      <path d="M16.5 20.57l7.5-4.35-7.5-3.35z" fill="#fff" fillOpacity=".2" />
      <path d="M9 16.22l7.5 4.35v-7.7z" fill="#fff" fillOpacity=".602" />
    </svg>
  );
}

/** USD Coin: dollar glyph inside a ring, on Circle's brand blue. */
function UsdcMark({ title }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full" role="img" aria-label={title}>
      <title>{title}</title>
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <circle cx="16" cy="16" r="10.6" fill="none" stroke="#fff" strokeWidth="1.5" />
      <path
        d="M16 8.4v15.2"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M19.4 12.5c0-1.5-1.5-2.5-3.4-2.5s-3.4 1-3.4 2.5c0 1.4 1.1 2.1 3.4 2.7 2.3.6 3.6 1.3 3.6 2.9 0 1.7-1.6 2.7-3.6 2.7s-3.6-1-3.6-2.7"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Starknet: the four-point spark, white on Starknet's navy. */
function StrkMark({ title }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full" role="img" aria-label={title}>
      <title>{title}</title>
      <circle cx="16" cy="16" r="16" fill="#0C0C4F" />
      <path
        d="M16 5.2l2.35 8.45L26.8 16l-8.45 2.35L16 26.8l-2.35-8.45L5.2 16l8.45-2.35z"
        fill="#fff"
      />
    </svg>
  );
}

const MARKS: Record<string, (props: MarkProps) => React.ReactElement> = {
  ETH: EthMark,
  USDC: UsdcMark,
  STRK: StrkMark,
};

/** Colour used for the symbol text beside the mark. */
const LABEL_COLORS: Record<string, string> = {
  ETH: "text-[#8fa2f5]",
  USDC: "text-[#5b9de0]",
  STRK: "text-foreground",
};

const SIZES = {
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-10 h-10",
} as const;

const LABEL_SIZES = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
} as const;

function normalize(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** True when a real mark exists, so callers can avoid rendering a placeholder next to real art. */
export function hasTokenMark(symbol: string): boolean {
  return normalize(symbol) in MARKS;
}

export default function TokenIcon({
  symbol,
  size = "md",
  showLabel = false,
  className = "",
}: {
  symbol: string;
  size?: "sm" | "md" | "lg";
  /** Show the ticker beside the mark. */
  showLabel?: boolean;
  className?: string;
}) {
  const key = normalize(symbol);
  const Mark = MARKS[key];

  return (
    <span className={`inline-flex items-center gap-2 shrink-0 ${className}`}>
      <span
        className={`${SIZES[size]} rounded-full overflow-hidden ring-1 ring-white/10 shrink-0 grid place-items-center`}
        title={symbol}
      >
        {Mark ? (
          <Mark title={symbol} />
        ) : (
          // Unknown token: neutral disc with as much of the ticker as fits.
          <span
            className="w-full h-full bg-surface-2 text-text-secondary grid place-items-center font-semibold leading-none"
            style={{ fontSize: size === "sm" ? 8 : size === "md" ? 10 : 12 }}
            role="img"
            aria-label={symbol}
          >
            {key.slice(0, 3) || "?"}
          </span>
        )}
      </span>
      {showLabel ? (
        <span
          className={`font-semibold ${LABEL_SIZES[size]} ${LABEL_COLORS[key] ?? "text-foreground"}`}
        >
          {symbol}
        </span>
      ) : null}
    </span>
  );
}
