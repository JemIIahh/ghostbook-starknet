import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Swap",
  description:
    "TEE-sealed private swap on GhostBook — encrypt intent, escrow on PrivacyRouter, match in Flare TEE, settle on Coston2.",
  openGraph: {
    title: "Swap · GhostBook",
    description:
      "Encrypt → escrow → TEE match → attested settlement. Confidential trading on Flare Coston2.",
  },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
