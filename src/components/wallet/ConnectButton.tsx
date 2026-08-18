"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Copy, ExternalLink, LogOut } from "lucide-react";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import { useWallet } from "@/context/WalletContext";
import { explorerContractUrl } from "@/lib/starknet/config";
import GhostLoader from "@/components/GhostLoader";

/** Deterministic gradient from an address for the avatar ring. */
function avatarStyle(address: string): CSSProperties {
  const hue = parseInt(address.slice(4, 10), 16) % 360;
  const hue2 = (hue + 48) % 360;
  return { background: `linear-gradient(135deg, hsl(${hue} 70% 48%), hsl(${hue2} 65% 38%))` };
}

export default function ConnectButton() {
  const {
    wallets,
    isConnected,
    isPending,
    address,
    shortAddress,
    network,
    isSupportedNetwork,
    chainId,
    error,
    connect,
    disconnect,
  } = useWallet();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const pick = async (wallet: WalletWithStarknetFeatures) => {
    try {
      await connect(wallet);
      setPickerOpen(false);
    } catch {
      /* error surfaces from context */
    }
  };

  if (isConnected && address) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((open) => !open)}
          className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-surface hover:bg-surface-2 border border-border transition-colors"
        >
          <span className="w-6 h-6 rounded-full shrink-0" style={avatarStyle(address)} />
          <span className="text-[13px] font-medium tabular-nums">{shortAddress}</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${isSupportedNetwork ? "bg-[#b8ff30]" : "bg-orange-400"}`}
            title={isSupportedNetwork ? `${network.label} · STRK20 available` : "Unsupported network"}
          />
        </button>

        {dropdownOpen ? (
          <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-surface border border-border shadow-xl overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[11px] uppercase tracking-wide text-text-secondary">Network</p>
              <p className="text-sm font-medium mt-0.5">
                {isSupportedNetwork ? network.label : "Unsupported"}
              </p>
              {!isSupportedNetwork ? (
                <p className="text-[11px] text-orange-400 mt-1">
                  Switch your wallet to Starknet Mainnet — the STRK20 pool lives there.
                </p>
              ) : null}
              {chainId ? (
                <p className="text-[10px] text-text-secondary mt-1 font-mono truncate">{chainId}</p>
              ) : null}
            </div>
            <button
              onClick={copyAddress}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-surface-2 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-[#b8ff30]" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy address"}
            </button>
            <a
              href={explorerContractUrl(network, address)}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View on Voyager
            </a>
            <button
              onClick={() => {
                disconnect();
                setDropdownOpen(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left text-red-400 hover:bg-surface-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setPickerOpen(true)}
        disabled={isPending}
        className="px-4 py-2 rounded-full bg-primary text-background text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {isPending ? "Connecting…" : "Connect"}
      </button>

      {pickerOpen ? (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={() => !isPending && setPickerOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Connect a Starknet wallet</h2>
              <button
                onClick={() => setPickerOpen(false)}
                className="text-text-secondary hover:text-foreground text-lg leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {isPending ? (
              <div className="py-6 flex justify-center">
                <GhostLoader size="lg" />
              </div>
            ) : wallets.length ? (
              <div className="space-y-2">
                {wallets.map((wallet) => (
                  <button
                    key={wallet.name}
                    onClick={() => pick(wallet)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-surface-2 hover:bg-border transition-colors text-left"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={wallet.icon} alt="" className="w-7 h-7 rounded-lg" />
                    <span className="text-sm font-medium flex-1">{wallet.name}</span>
                    <span className="text-text-secondary">→</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">
                No Starknet wallet detected. GhostBook needs a wallet that implements the STRK20
                wallet API —{" "}
                <a
                  className="text-primary hover:underline"
                  href="https://www.ready.co/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Ready
                </a>{" "}
                supports it today.
              </p>
            )}

            {error ? <p className="text-xs text-red-400 mt-3">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
