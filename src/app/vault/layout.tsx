import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vault",
  description:
    "CipherSign TEE vault on Flare Confidential Compute — policy-gated signing for treasury, LP, and keeper payouts.",
  openGraph: {
    title: "Vault · GhostBook",
    description:
      "Lock allowlist, cap, and expiry in the TEE. Only compliant intents get signed.",
  },
};

export default function VaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
