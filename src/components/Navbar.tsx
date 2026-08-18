"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import ConnectButton from "@/components/wallet/ConnectButton";
import GhostLogo from "@/components/GhostLogo";

const navItems = [
  { href: "/orders", label: "Orders" },
  { href: "/private", label: "Balance" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 w-full bg-background/85 backdrop-blur-md border-b border-border">
      <div className="mx-auto max-w-[1280px] px-[clamp(20px,5vw,72px)]">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="group flex items-center gap-2.5">
            <GhostLogo size={26} priority className="w-[26px] h-[26px]" />
            <span className="display text-[15px] tracking-[-0.01em]">Ghostbook</span>
            <span className="tag hidden sm:inline ml-1 text-text-ghost">[ STRK20 ]</span>
          </Link>

          <div className="hidden md:flex items-center gap-7">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`mono text-[11px] tracking-[0.22em] uppercase transition-colors ${
                    active ? "text-primary" : "text-text-secondary hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <ConnectButton />
            <button
              onClick={() => setMobileOpen((open) => !open)}
              className="md:hidden p-2 text-text-secondary hover:text-foreground transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <div className="md:hidden border-t border-border bg-background">
          <div className="px-[clamp(20px,5vw,72px)] py-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`block py-3 mono text-[11px] tracking-[0.22em] uppercase border-b border-line-subtle last:border-0 ${
                  pathname === item.href ? "text-primary" : "text-text-secondary"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
