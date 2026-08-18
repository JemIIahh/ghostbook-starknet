import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Orders",
  description:
    "Private limit orders and TWAP on Starknet. Commit your terms once; the anonymizer enforces limit price, slice size, pacing and expiry on every fill, and settles into STRK20 private notes.",
  openGraph: {
    title: "Orders · GhostBook",
    description:
      "Private limit orders and TWAP, enforced on-chain and filled through Ekubo.",
  },
};

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
