"use client";

/**
 * Wallet layer for Starknet.
 *
 * Connection goes through the wallet-standard discovery store and `WalletAccountV6`, which is what
 * exposes the STRK20 wallet API (`strk20InvokeTransaction`, `strk20Balances`). The dapp asks the
 * wallet to perform private actions; it never handles the user's viewing key.
 *
 * MetaMask is excluded from discovery (`eip1193Adapters: []` plus a name filter): its Starknet Snap
 * probing spams an unlock popup and it can't do STRK20.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { WalletAccountV6, validateAndParseAddress, walletV6 } from "starknet";
import { WALLET_API } from "@starknet-io/types-js";
import { createStore, type Store } from "@starknet-io/get-starknet-discovery";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import {
  DEFAULT_NETWORK,
  NETWORKS,
  networkForChainId,
  providerFor,
  type NetworkConfig,
} from "@/lib/starknet/config";

export type WalletContextValue = {
  wallets: WalletWithStarknetFeatures[];
  wallet: WalletWithStarknetFeatures | null;
  walletAccount: WalletAccountV6 | null;
  address: string | null;
  shortAddress: string;
  isConnected: boolean;
  isPending: boolean;
  error: string | null;
  chainId: string | null;
  /** Network the wallet reports, or the default when nothing is connected. */
  network: NetworkConfig;
  /** True when the connected chain has a STRK20 pool and a GhostBook deployment configured. */
  isSupportedNetwork: boolean;
  connect: (wallet: WalletWithStarknetFeatures) => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<WalletWithStarknetFeatures[]>([]);
  const [wallet, setWallet] = useState<WalletWithStarknetFeatures | null>(null);
  const [walletAccount, setWalletAccount] = useState<WalletAccountV6 | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create the discovery store on mount so wallets have time to register themselves.
  useEffect(() => {
    const store: Store = createStore({ eip1193Adapters: [] });
    const visible = (list: readonly WalletWithStarknetFeatures[]) =>
      list.filter((w) => !normalize(w.name).includes("metamask"));
    setWallets(visible(store.getWallets()));
    const unsubscribe = store.subscribe((next) => setWallets(visible(next)));
    return () => unsubscribe();
  }, []);

  const network = useMemo(
    () => networkForChainId(chainId ?? undefined) ?? NETWORKS[DEFAULT_NETWORK],
    [chainId],
  );

  const connect = useCallback(async (selected: WalletWithStarknetFeatures) => {
    setError(null);
    setIsPending(true);
    try {
      // Connect against the default network's provider first; the chain the wallet reports below
      // decides which provider the rest of the app reads from.
      const account = await WalletAccountV6.connect(
        providerFor(NETWORKS[DEFAULT_NETWORK]),
        selected,
      );
      const accounts = await walletV6.requestAccounts(selected);
      if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new Error("This wallet did not return an account.");
      }
      const permissions = (await walletV6.getPermissions(selected)) as WALLET_API.Permission[];
      if (!permissions.includes(WALLET_API.Permission.ACCOUNTS)) {
        throw new Error("Wallet did not grant account permission.");
      }

      setWallet(selected);
      setWalletAccount(account);
      setAddress(validateAndParseAddress(accounts[0]));
      setChainId((await walletV6.requestChainId(selected)) as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet connection failed.");
      setWallet(null);
      setWalletAccount(null);
      setAddress(null);
      setChainId(null);
      throw err;
    } finally {
      setIsPending(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    setWalletAccount(null);
    setAddress(null);
    setChainId(null);
    setError(null);
  }, []);

  // Follow the wallet if the user switches network or account while connected.
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    const poll = window.setInterval(async () => {
      try {
        const [nextChain, accounts] = await Promise.all([
          walletV6.requestChainId(wallet) as Promise<string>,
          walletV6.requestAccounts(wallet),
        ]);
        if (cancelled) return;
        setChainId((current) => (current === nextChain ? current : nextChain));
        if (Array.isArray(accounts) && accounts[0]) {
          const next = validateAndParseAddress(accounts[0]);
          setAddress((current) => (current === next ? current : next));
        }
      } catch {
        /* wallet locked or navigated away — keep the last known state */
      }
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [wallet]);

  const value = useMemo<WalletContextValue>(() => {
    const isConnected = Boolean(walletAccount && address);
    return {
      wallets,
      wallet,
      walletAccount,
      address,
      shortAddress: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "",
      isConnected,
      isPending,
      error,
      chainId,
      network,
      isSupportedNetwork: Boolean(networkForChainId(chainId ?? undefined)?.privacyPool),
      connect,
      disconnect,
    };
  }, [wallets, wallet, walletAccount, address, isPending, error, chainId, network, connect, disconnect]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}
