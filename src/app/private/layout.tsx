import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Private balance",
  description:
    "Shield ERC-20s into the STRK20 privacy pool, transfer note-to-note with no amount or parties on-chain, and unshield to a public address.",
  openGraph: {
    title: "Private balance · GhostBook",
    description: "Shield, private transfer and unshield through the STRK20 pool.",
  },
};

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
