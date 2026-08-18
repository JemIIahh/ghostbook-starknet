import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pool",
  description: "GhostBook pool specs — liquidity, price, tick, and reserves on Flare Coston2.",
};

export default function PoolDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
