import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Liquidity",
  description:
    "Add or remove concentrated liquidity on GhostBook pools — Flare Testnet Coston2.",
};

export default function LiquidityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
