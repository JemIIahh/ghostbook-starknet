"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useWallet } from "@/context/WalletContext";
import { getExplorerContractUrl, getNetwork } from "@/lib/constants";
import { useBalance } from "wagmi";
import { coston2 } from "@/lib/chains";
import {
  Copy,
  Check,
  ExternalLink,
  LogOut,
} from "lucide-react";
import GhostLogo from "@/components/GhostLogo";
import GhostLoader from "@/components/GhostLoader";
import { formatAmount } from "@/lib/format";

/** Deterministic gradient from an address for the avatar ring. */
function avatarStyle(address: string): CSSProperties {
  const hue = parseInt(address.slice(2, 8), 16) % 360;
  const hue2 = (hue + 48) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue} 70% 48%), hsl(${hue2} 65% 38%))`,
  };
}

export default function ConnectButton() {
  const {
    isConnected,
    isPending,
    address,
    shortAddress,
    connect,
    disconnect,
  } = useWallet();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: balance } = useBalance({
    address: address as `0x${string}` | undefined,
    chainId: coston2.id,
    query: { enabled: Boolean(address) },
  });

  const displayBalance = balance
    ? `${formatAmount(Number(balance.value) / 10 ** balance.decimals)} ${balance.symbol}`
    : "—";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setDropdownOpen(false);
  };

  if (isPending) {
    return <GhostLoader size="sm" className="w-9 h-9" />;
  }

  if (!isConnected) {
    return (
      <button
        onClick={connect}
        className="h-9 px-4 rounded-full text-sm font-semibold bg-primary hover:bg-primary-hover text-white transition-colors"
      >
        Connect
      </button>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        aria-label="Account menu"
        aria-expanded={dropdownOpen}
        className="relative w-9 h-9 rounded-full ring-2 ring-border hover:ring-foreground/30 transition-all focus:outline-none focus-visible:ring-foreground/50"
        style={address ? avatarStyle(address) : undefined}
      >
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white/95 tracking-wide select-none">
          {shortAddress.replace("0x", "").slice(0, 2).toUpperCase()}
        </span>
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-background" />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-surface border border-border shadow-xl p-2 z-50 animate-fade-in">
          <div className="flex items-center gap-3 px-3 py-3 mb-1">
            <GhostLogo size={48} className="w-12 h-12 shrink-0" alt="" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{shortAddress}</p>
              <p className="text-xs text-text-secondary flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                {getNetwork().name}
              </p>
            </div>
          </div>

          <div className="mx-2 mb-2 px-3 py-2.5 rounded-xl bg-surface-2">
            <p className="text-[11px] uppercase tracking-wide text-text-tertiary">
              Balance
            </p>
            <p className="text-sm font-mono text-foreground mt-0.5">
              {displayBalance}
            </p>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm hover:bg-surface-2 transition-colors"
          >
            {copied ? (
              <Check className="w-4 h-4 text-success" />
            ) : (
              <Copy className="w-4 h-4 text-text-secondary" />
            )}
            <span>{copied ? "Copied!" : "Copy address"}</span>
          </button>

          <a
            href={address ? getExplorerContractUrl(address) : "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm hover:bg-surface-2 transition-colors"
            onClick={() => setDropdownOpen(false)}
          >
            <ExternalLink className="w-4 h-4 text-text-secondary" />
            <span>View on Explorer</span>
          </a>

          <div className="my-1 border-t border-border" />

          <button
            onClick={handleDisconnect}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-danger hover:bg-surface-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Disconnect</span>
          </button>
        </div>
      )}
    </div>
  );
}
