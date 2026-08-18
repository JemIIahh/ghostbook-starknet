import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin",
  description:
    "Create pools, mint demo tokens, and inspect GhostBook balances on Flare Coston2.",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
