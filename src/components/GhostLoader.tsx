"use client";

import Image from "next/image";

type GhostLoaderProps = {
  /** Visual scale of the ghost */
  size?: "sm" | "md" | "lg" | "xl";
  /** Full-screen overlay centered on the viewport */
  fullScreen?: boolean;
  /** Optional caption under the ghost (full-screen defaults to GhostBook) */
  label?: string | null;
  className?: string;
};

const SIZES = {
  sm: 36,
  md: 64,
  lg: 120,
  xl: 168,
} as const;

/**
 * Brand loader — floating ghost with soft aura rings.
 */
export default function GhostLoader({
  size = "md",
  fullScreen = false,
  label,
  className = "",
}: GhostLoaderProps) {
  const px = SIZES[size];
  const showLabel = label !== null && (label !== undefined ? label : fullScreen ? "GhostBook" : null);
  const ringPad = size === "sm" ? 8 : size === "md" ? 14 : 22;

  const ghost = (
    <div
      className={`ghost-loader relative inline-flex flex-col items-center justify-center ${className}`}
      role="status"
      aria-label={showLabel || "Loading"}
    >
      <div
        className="relative flex items-center justify-center"
        style={{ width: px + ringPad * 2, height: px + ringPad * 2 }}
      >
        {/* Soft aura */}
        <span className="ghost-loader-aura absolute inset-[12%] rounded-full" aria-hidden />
        {/* Orbit ring */}
        {size !== "sm" && (
          <span
            className="ghost-loader-ring absolute inset-0 rounded-full border border-primary/25"
            aria-hidden
          />
        )}
        {/* Trace arc */}
        {size !== "sm" && (
          <span className="ghost-loader-orbit absolute inset-0" aria-hidden>
            <span className="ghost-loader-dot" />
          </span>
        )}

        <div className="ghost-loader-bob relative z-10">
          <Image
            src="/ghost.png"
            alt=""
            width={px}
            height={px}
            priority
            className="object-contain select-none pointer-events-none"
            aria-hidden
          />
        </div>
      </div>

      {showLabel ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="text-sm font-semibold tracking-wide text-foreground/90">{showLabel}</p>
          <div className="ghost-loader-dots flex items-center gap-1.5" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : null}
    </div>
  );

  if (!fullScreen) return ghost;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(197,52,0,0.14)_0%,transparent_55%)]" />
      <Image
        src="/ghost.png"
        alt=""
        width={280}
        height={280}
        className="pointer-events-none absolute -left-10 top-16 opacity-[0.06] -rotate-12 select-none"
        aria-hidden
      />
      <Image
        src="/ghost.png"
        alt=""
        width={220}
        height={220}
        className="pointer-events-none absolute -right-8 bottom-20 opacity-[0.05] rotate-12 select-none"
        aria-hidden
      />
      {ghost}
    </div>
  );
}
