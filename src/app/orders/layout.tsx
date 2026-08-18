import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Orders",
  description:
    "TEE-sealed market and limit orders on GhostBook. Escrow intents privately, fill with attested settlement on Flare Coston2.",
  openGraph: {
    title: "Orders · GhostBook",
    description:
      "Place sealed market & limit orders — PrivacyRouter escrow with Flare TEE attestation.",
  },
};

export default function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
