import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pools",
  description:
    "Discover GhostBook Uniswap V3–style pools on Flare Coston2 and manage concentrated liquidity positions.",
};

export default function PoolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
