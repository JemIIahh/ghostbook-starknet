"use client";

/**
 * Account control: avatar + dropdown when connected, wallet picker when not.
 *
 * Starknet has no single injected provider, so connecting means choosing from the wallet-standard
 * discovery list. The picker is the only addition to the original shape — everything the user does
 * afterwards (copy, explorer, disconnect) lives in the same dropdown as before.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, ExternalLink, LogOut, X } from "lucide-react";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import { useWallet } from "@/context/WalletContext";
import { explorerContractUrl } from "@/lib/starknet/config";
import GhostLogo from "@/components/GhostLogo";
import GhostLoader from "@/components/GhostLoader";

/**
 * Deterministic gradient and initials from an address.
 *
 * Starknet addresses are zero-padded to 64 hex characters and a felt's top nibble is virtually
 * always 0, so the *leading* characters carry almost no entropy — every avatar would read "00".
 * The tail is used instead.
 */
function avatarStyle(address: string): CSSProperties {
  const tail = address.slice(-6);
  const hue = parseInt(tail, 16) % 360;
  const hue2 = (hue + 48) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue} 70% 48%), hsl(${hue2} 65% 38%))`,
  };
}

function initials(address: string): string {
  return address.slice(-2).toUpperCase();
}

/** `full` renders the card-CTA shape used inside page panels. */
type ConnectButtonProps = { variant?: "pill" | "full" };

export default function ConnectButton({ variant = "pill" }: ConnectButtonProps) {
  const {
    wallets,
    wallet,
    isConnected,
    isPending,
    address,
    shortAddress,
    network,
    isSupportedNetwork,
    isDiscovering,
    error,
    connect,
    switchToMainnet,
    disconnect,
  } = useWallet();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Both panels are anchored inside the same container, so one outside-click handler covers them.
  // The picker stays open while a connection is in flight — closing it would hide the spinner.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setDropdownOpen(false);
      setPickerOpen((open) => (isPending ? open : false));
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isPending]);

  // Escape closes whichever surface is open — a modal with no keyboard exit is a trap.
  useEffect(() => {
    if (!dropdownOpen && !pickerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setDropdownOpen(false);
      if (!isPending) setPickerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dropdownOpen, pickerOpen, isPending]);

  const openPicker = () => {
    // A failure from a previous attempt must not greet the next one.
    setLocalError(null);
    setPickerOpen(true);
  };

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

  const pick = async (wallet: WalletWithStarknetFeatures) => {
    setLocalError(null);
    try {
      await connect(wallet);
      setPickerOpen(false);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Wallet connection failed.");
    }
  };

  /**
   * Anchored to the button, not a full-screen modal.
   *
   * A `position: fixed` overlay cannot be used here: the navbar carries `backdrop-blur`, and
   * `backdrop-filter` makes an element a containing block for fixed descendants — so `inset-0`
   * resolved to the 56px-tall navbar and the panel rendered clipped at the top of the page. An
   * anchored panel is immune to that, matches the account dropdown, and puts the choice where the
   * user clicked.
   */
  const picker = (
    <AnimatePresence>
      {pickerOpen && (
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.14 }}
          className={`absolute top-full mt-2 z-50 rounded-2xl bg-surface border border-border shadow-xl p-3 ${
            variant === "full" ? "left-0 right-0" : "right-0 w-[300px]"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Connect a wallet</h3>
            <button
              onClick={() => setPickerOpen(false)}
              className="p-1 rounded-lg text-text-tertiary hover:text-foreground hover:bg-surface-2 transition-colors"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-xs text-text-tertiary leading-relaxed mb-3">
            Needs the STRK20 wallet API — the wallet performs every private action, so GhostBook
            never touches your viewing key.
          </p>

          {wallets.length ? (
            <div className="space-y-1.5">
              {wallets.map((wallet) => (
                <button
                  key={wallet.name}
                  onClick={() => pick(wallet)}
                  disabled={isPending}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-2 hover:bg-surface-hover transition-colors disabled:opacity-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={wallet.icon} alt="" className="w-6 h-6 rounded-md shrink-0" />
                  <span className="text-sm font-medium flex-1 text-left truncate">{wallet.name}</span>
                  {isPending ? <GhostLoader size="sm" className="scale-[0.5]" /> : null}
                </button>
              ))}
            </div>
          ) : isDiscovering ? (
            <div className="flex items-center gap-2.5 py-2 text-xs text-text-secondary">
              <GhostLoader size="sm" className="scale-[0.55]" />
              Looking for wallets…
            </div>
          ) : (
            <p className="text-xs text-text-secondary leading-relaxed">
              No Starknet wallet detected.{" "}
              <a
                href="https://www.ready.co/"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Ready
              </a>{" "}
              supports STRK20 today.
            </p>
          )}

          {localError ?? error ? (
            <p className="mt-2.5 text-xs text-danger leading-relaxed">{localError ?? error}</p>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!isConnected || !address) {
    return (
      <div ref={dropdownRef} className={`relative ${variant === "full" ? "w-full" : ""}`}>
        <button
          onClick={openPicker}
          disabled={isPending}
          className={
            variant === "full"
              ? "w-full px-4 py-3.5 rounded-2xl bg-primary hover:bg-primary-hover text-white font-semibold transition-colors disabled:opacity-60"
              : "h-9 px-4 rounded-full text-sm font-semibold bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-60"
          }
        >
          {isPending ? "Connecting…" : variant === "full" ? "Connect Wallet" : "Connect"}
        </button>
        {picker}
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        aria-label="Account menu"
        aria-expanded={dropdownOpen}
        className="relative w-9 h-9 rounded-full ring-2 ring-border hover:ring-foreground/30 transition-all focus:outline-none focus-visible:ring-foreground/50"
        style={avatarStyle(address)}
      >
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white/95 tracking-wide select-none">
          {initials(address)}
        </span>
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-background ${
            isSupportedNetwork ? "bg-success" : "bg-warning"
          }`}
        />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-surface border border-border shadow-xl p-2 z-50">
          <div className="flex items-center gap-3 px-3 py-3 mb-1">
            {wallet?.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={wallet.icon}
                alt=""
                className="w-10 h-10 rounded-xl shrink-0 ring-1 ring-border"
              />
            ) : (
              <GhostLogo size={40} className="w-10 h-10 shrink-0" alt="" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{wallet?.name ?? "Wallet"}</p>
              <p className="text-xs text-text-secondary font-mono truncate mt-0.5">
                {shortAddress}
              </p>
              <p className="text-xs text-text-secondary flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isSupportedNetwork ? "bg-success" : "bg-warning"
                  }`}
                />
                {isSupportedNetwork ? `Starknet ${network.label}` : "Unsupported network"}
              </p>
            </div>
          </div>

          {!isSupportedNetwork ? (
            <div className="mx-2 mb-2 px-3 py-2.5 rounded-xl bg-surface-2">
              <p className="text-xs text-warning leading-relaxed">
                The STRK20 pool lives on Starknet Mainnet.
              </p>
              <button
                onClick={() => void switchToMainnet()}
                className="mt-2 w-full py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary-hover text-white transition-colors"
              >
                Switch to Mainnet
              </button>
            </div>
          ) : null}

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
            href={explorerContractUrl(network, address)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm hover:bg-surface-2 transition-colors"
            onClick={() => setDropdownOpen(false)}
          >
            <ExternalLink className="w-4 h-4 text-text-secondary" />
            <span>View on Voyager</span>
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
