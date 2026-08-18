"use client";

import type { ReactNode } from "react";

const WIDTH = {
  sm: "max-w-[560px]",
  md: "max-w-[760px]",
  lg: "max-w-[1100px]",
} as const;

type GhostPageShellProps = {
  /** Mono kicker above the title, e.g. "PRIVATE BALANCE". */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  maxWidth?: keyof typeof WIDTH;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Page frame: mono eyebrow, uppercase display title, hairline rule, then content.
 * Follows the STRK20 section rhythm — fluid gutter, capped width, generous top padding.
 */
export default function GhostPageShell({
  eyebrow,
  title,
  subtitle,
  maxWidth = "md",
  headerRight,
  children,
  className = "",
}: GhostPageShellProps) {
  return (
    <div className={`px-[clamp(20px,5vw,72px)] pt-14 sm:pt-20 pb-24 ${className}`}>
      <div className={`mx-auto ${WIDTH[maxWidth]}`}>
        <header className="reveal">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              {eyebrow ? (
                <p className="eyebrow mb-3.5">
                  <b>◢</b> {eyebrow}
                </p>
              ) : null}
              <h1 className="display text-[clamp(30px,4.4vw,50px)]">{title}</h1>
            </div>
            {headerRight ? <div className="shrink-0 pb-1">{headerRight}</div> : null}
          </div>
          {subtitle ? (
            <p className="mt-4 max-w-[62ch] text-[14px] leading-relaxed text-text-secondary">
              {subtitle}
            </p>
          ) : null}
          <div className="mt-7 border-t border-border" />
        </header>

        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
