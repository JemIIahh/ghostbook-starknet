"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, LogOut } from "lucide-react";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import { useWallet } from "@/context/WalletContext";
import { explorerContractUrl } from "@/lib/starknet/config";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
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
      /* surfaced from context */
    }
  };

  if (isConnected && address) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="btn btn-ghost !py-2 !px-3 gap-2"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${isSupportedNetwork ? "bg-primary" : "bg-warning"}`}
          />
          <span className="mono text-[11px] tracking-[0.06em] normal-case">{shortAddress}</span>
        </button>

        {menuOpen ? (
          <div className="absolute right-0 mt-2 w-[268px] panel-flat z-50">
            <div className="px-4 py-3 border-b border-border">
              <p className="label">Network</p>
              <p className="mono text-[12px] mt-1">
                {isSupportedNetwork ? network.label.toUpperCase() : "UNSUPPORTED"}
              </p>
              {!isSupportedNetwork ? (
                <p className="text-[11px] text-warning mt-1.5 leading-relaxed">
                  Switch your wallet to Starknet Mainnet — the STRK20 pool lives there.
                </p>
              ) : chainId ? (
                <p className="mono text-[10px] text-text-ghost mt-1 truncate">{chainId}</p>
              ) : null}
            </div>
            <button
              onClick={copyAddress}
              className="w-full flex items-center gap-2.5 px-4 py-3 mono text-[11px] tracking-[0.12em] uppercase text-text-secondary hover:text-foreground hover:bg-surface-2 transition-colors"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? "Copied" : "Copy address"}
            </button>
            <a
              href={explorerContractUrl(network, address)}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center gap-2.5 px-4 py-3 mono text-[11px] tracking-[0.12em] uppercase text-text-secondary hover:text-foreground hover:bg-surface-2 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Voyager ↗
            </a>
            <button
              onClick={() => {
                disconnect();
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-4 py-3 mono text-[11px] tracking-[0.12em] uppercase text-text-secondary hover:text-danger hover:bg-surface-2 transition-colors border-t border-line-subtle"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setPickerOpen(true)} disabled={isPending} className="btn btn-orange !py-2.5">
        {isPending ? "Connecting…" : "Connect"}
      </button>

      {pickerOpen ? (
        <div
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={() => !isPending && setPickerOpen(false)}
        >
          <div
            className="w-full max-w-[420px] panel p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow mb-3">
              <b>◢</b> Connect
            </p>
            <h2 className="display text-[26px] mb-1">Starknet wallet</h2>
            <p className="text-[13px] text-text-secondary mb-5 leading-relaxed">
              GhostBook needs a wallet implementing the STRK20 wallet API — it performs the private
              actions, so this app never touches your viewing key.
            </p>

            {wallets.length ? (
              <div className="space-y-2">
                {wallets.map((wallet) => (
                  <button
                    key={wallet.name}
                    onClick={() => pick(wallet)}
                    disabled={isPending}
                    className="w-full flex items-center gap-3 px-3 py-3 border border-border rounded-[2px] hover:border-primary/50 hover:bg-primary-soft transition-colors text-left disabled:opacity-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={wallet.icon} alt="" className="w-6 h-6" />
                    <span className="mono text-[12px] tracking-[0.06em] flex-1">{wallet.name}</span>
                    <span className="text-primary">→</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-text-secondary">
                No Starknet wallet detected.{" "}
                <a
                  className="text-primary hover:underline"
                  href="https://www.ready.co/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Ready ↗
                </a>{" "}
                supports STRK20 today.
              </p>
            )}

            {error ? <p className="text-[12px] text-danger mt-4">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
