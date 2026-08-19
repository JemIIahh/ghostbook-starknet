"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import GhostLogo from "@/components/GhostLogo";

const WIDTH = {
  xs: "max-w-[480px]",
  sm: "max-w-[480px]",
  md: "max-w-[720px]",
  lg: "max-w-[800px]",
} as const;

type GhostPageShellProps = {
  title: string;
  subtitle?: string;
  /** xs=400 (swap), sm=440, md=640 (vault/admin), lg=800 (pools/orders) */
  maxWidth?: keyof typeof WIDTH;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Shared Swap-style layout: ghost watermarks + logo header. */
export default function GhostPageShell({
  title,
  subtitle,
  maxWidth = "sm",
  headerRight,
  children,
  className = "",
}: GhostPageShellProps) {
  return (
    <div
      className={`relative min-h-[calc(100vh-72px)] flex flex-col items-center px-4 pt-8 sm:pt-16 pb-12 overflow-hidden ${className}`}
    >
      <Image
        src="/ghost.png"
        alt=""
        width={340}
        height={340}
        className="pointer-events-none absolute -right-16 top-16 opacity-[0.08] rotate-12 hidden sm:block"
        aria-hidden
      />
      <Image
        src="/ghost.png"
        alt=""
        width={240}
        height={240}
        className="pointer-events-none absolute -left-12 bottom-16 opacity-[0.07] -rotate-12 hidden sm:block"
        aria-hidden
      />
      <Image
        src="/ghost.png"
        alt=""
        width={160}
        height={160}
        className="pointer-events-none absolute right-1/4 bottom-8 opacity-[0.04] rotate-6 hidden lg:block"
        aria-hidden
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={`w-full ${WIDTH[maxWidth]}`}
      >
        <div className="flex items-center justify-between gap-3 mb-3 px-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <GhostLogo size={36} className="w-9 h-9 shrink-0" alt="" />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight">{title}</h1>
              {subtitle ? (
                <p className="text-xs sm:text-sm text-text-secondary mt-0.5 truncate">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
        </div>
        {children}
      </motion.div>
    </div>
  );
}
