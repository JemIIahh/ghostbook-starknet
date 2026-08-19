import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Balance",
  description:
    "Shield ERC-20s into the STRK20 privacy pool, send note-to-note with no amount or parties on-chain, and withdraw to a public address.",
  openGraph: {
    title: "Balance · GhostBook",
    description: "Shield, private send and withdraw through the STRK20 pool.",
  },
};

export default function BalanceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
