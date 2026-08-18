"use client";

/** Emoji icons for every GhostBook token. */
export const TOKEN_EMOJIS: Record<string, string> = {
  GHOST: "👻",
  BOOK: "📖",
  SPARK: "⚡",
  USDT0: "💵",
  USDT: "💵",
  USDC: "💵",
  FXRP: "💧",
  C2FLR: "🔥",
  WC2FLR: "🔥",
  FLR: "🔥",
};

const colors: Record<string, { bg: string; text: string }> = {
  GHOST: { bg: "bg-[#b8ff30]/15", text: "text-[#b8ff30]" },
  BOOK: { bg: "bg-sky-500/15", text: "text-sky-400" },
  SPARK: { bg: "bg-orange-500/15", text: "text-orange-400" },
  FXRP: { bg: "bg-indigo-500/15", text: "text-indigo-300" },
  USDT0: { bg: "bg-green-500/15", text: "text-green-400" },
  USDT: { bg: "bg-green-500/15", text: "text-green-400" },
  USDC: { bg: "bg-green-500/15", text: "text-green-400" },
  C2FLR: { bg: "bg-pink-500/15", text: "text-pink-400" },
  WC2FLR: { bg: "bg-pink-500/15", text: "text-pink-400" },
};

export function getTokenEmoji(symbol: string): string {
  const key = symbol.trim().toUpperCase();
  return TOKEN_EMOJIS[key] || TOKEN_EMOJIS[key.replace(/[^A-Z0-9]/g, "")] || "🪙";
}

export default function TokenIcon({
  symbol,
  size = "md",
  showLabel = false,
  className = "",
}: {
  symbol: string;
  size?: "sm" | "md" | "lg";
  /** Show emoji + symbol text inline */
  showLabel?: boolean;
  className?: string;
}) {
  const c = colors[symbol] || { bg: "bg-primary-soft", text: "text-primary" };
  const emoji = getTokenEmoji(symbol);
  const sizes = {
    sm: "w-6 h-6 text-sm",
    md: "w-8 h-8 text-base",
    lg: "w-10 h-10 text-xl",
  };
  const labelSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <span className={`inline-flex items-center gap-2 shrink-0 ${className}`}>
      <span
        className={`${sizes[size]} rounded-full ${c.bg} flex items-center justify-center leading-none select-none`}
        role="img"
        aria-label={symbol}
        title={symbol}
      >
        {emoji}
      </span>
      {showLabel ? (
        <span className={`font-semibold ${labelSizes[size]} ${c.text}`}>{symbol}</span>
      ) : null}
    </span>
  );
}
