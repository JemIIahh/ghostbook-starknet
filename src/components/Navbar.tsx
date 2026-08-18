"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ConnectButton from "@/components/wallet/ConnectButton";
import GhostLogo from "@/components/GhostLogo";

const navItems = [
  { href: "/private", label: "Private balance" },
  { href: "/orders", label: "Orders" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isNavActive = (href: string) => pathname === href;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 w-full bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 w-full">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <GhostLogo
              size={44}
              priority
              className="w-10 h-10 sm:w-11 sm:h-11 drop-shadow-[0_0_10px_rgba(184,255,48,0.4)] group-hover:scale-105 transition-transform"
            />
            <span className="text-[17px] sm:text-lg font-semibold tracking-tight">
              GhostBook
            </span>
          </Link>

          <div className="hidden md:flex flex-1 justify-center">
            <div className="flex items-center gap-0.5 bg-surface rounded-full p-1">
              {navItems.map((item) => {
                const isActive = isNavActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? "bg-surface-2 text-foreground"
                        : "text-text-secondary hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ConnectButton />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-full text-text-secondary hover:text-foreground hover:bg-surface transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-border bg-background w-full overflow-hidden"
          >
            <div className="px-4 py-3 space-y-1">
              {navItems.map((item) => {
                const isActive = isNavActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`block px-4 py-2.5 rounded-xl text-[15px] font-medium transition-colors ${
                      isActive
                        ? "bg-surface text-foreground"
                        : "text-text-secondary hover:text-foreground hover:bg-surface"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
