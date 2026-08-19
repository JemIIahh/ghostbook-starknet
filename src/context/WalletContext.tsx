"use client";

/**
 * Wallet layer for Starknet.
 *
 * Connection goes through the wallet-standard discovery store and `WalletAccountV6`, which is what
 * exposes the STRK20 wallet API (`strk20InvokeTransaction`, `strk20Balances`). The dapp asks the
 * wallet to perform private actions; it never handles the user's viewing key.
 *
 * Three things are worth knowing before changing this file:
 *
 * 1. `WalletAccountV6.connect` already performs `standard:connect` internally, which is the priming
 *    the wallet-standard wrapper requires before it will bridge the wallet's `accountsChanged` /
 *    `networkChanged` events. So `subscribeWalletEvent` is reliable and there is no reason to poll
 *    `requestAccounts` — that call is an *authorization request*, and polling it re-prompts.
 * 2. A `WalletAccountV6` is bound to the provider it was built with. When the wallet reports a
 *    different chain, the account has to be rebuilt against that chain's provider, or it signs for
 *    one network while reading from another.
 * 3. MetaMask is excluded from discovery (`eip1193Adapters: []` plus a name filter): its Starknet
 *    Snap probing spams an unlock popup and it can't do STRK20.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { WalletAccountV6, validateAndParseAddress, walletV6 } from "starknet";
import { createStore, type Store } from "@starknet-io/get-starknet-discovery";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import {
  DEFAULT_NETWORK,
  MAINNET,
  NETWORKS,
  networkForChainId,
  providerFor,
  type NetworkConfig,
} from "@/lib/starknet/config";

/** `discovering` is distinct from `disconnected`: wallets register a tick after mount. */
export type WalletStatus = "discovering" | "disconnected" | "connecting" | "connected";

export type WalletContextValue = {
  wallets: WalletWithStarknetFeatures[];
  wallet: WalletWithStarknetFeatures | null;
  walletAccount: WalletAccountV6 | null;
  address: string | null;
  shortAddress: string;
  status: WalletStatus;
  isConnected: boolean;
  isPending: boolean;
  /** True until wallet discovery has had a chance to report. */
  isDiscovering: boolean;
  error: string | null;
  chainId: string | null;
  /** Network the wallet reports, or the default when nothing is connected. */
  network: NetworkConfig;
  /** True when the connected chain has a STRK20 pool configured. */
  isSupportedNetwork: boolean;
  connect: (wallet: WalletWithStarknetFeatures) => Promise<void>;
  /** Asks the wallet to move to Starknet mainnet, where the STRK20 pool lives. */
  switchToMainnet: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const LAST_WALLET_KEY = "ghostbook:wallet";
/** Discovery is event-driven with no completion signal, so give registrations a moment to land. */
const DISCOVERY_GRACE_MS = 600;

/**
 * The discovery store is a browser-global concern, so it is created once rather than per mount.
 */
let discoveryStore: Store | null = null;
function getDiscoveryStore(): Store {
  discoveryStore ??= createStore({ eip1193Adapters: [] });
  return discoveryStore;
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Chain ids are felts; compare numerically so formatting differences don't read as "unsupported". */
function sameChain(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return a === b;
  if (a === b) return true;
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

function parseAddress(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return validateAndParseAddress(value);
  } catch {
    return null;
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<WalletWithStarknetFeatures[]>([]);
  const [wallet, setWallet] = useState<WalletWithStarknetFeatures | null>(null);
  const [walletAccount, setWalletAccount] = useState<WalletAccountV6 | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus>("discovering");
  const [error, setError] = useState<string | null>(null);

  /** Read inside event handlers, which must not close over a stale chain id. */
  const chainIdRef = useRef<string | null>(null);
  useEffect(() => {
    chainIdRef.current = chainId;
  }, [chainId]);
  /** Guards the one-shot silent reconnect so re-renders can't retry it in a loop. */
  const reconnectTried = useRef(false);

  // ── Discovery ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const store = getDiscoveryStore();
    const publish = (list: readonly WalletWithStarknetFeatures[]) =>
      setWallets(list.filter((w) => !normalize(w.name).includes("metamask")));

    const unsubscribe = store.subscribe(publish);
    // The first snapshot is read on a task rather than inline: wallets already registered before
    // mount would otherwise set state synchronously inside the effect and cascade a render.
    const initial = window.setTimeout(() => publish(store.getWallets()), 0);

    // Leave "discovering" on a timer rather than on first registration: a machine with no wallet
    // installed never fires the subscription, and must still reach a settled state.
    const settle = window.setTimeout(() => {
      setStatus((current) => (current === "discovering" ? "disconnected" : current));
    }, DISCOVERY_GRACE_MS);

    return () => {
      window.clearTimeout(initial);
      window.clearTimeout(settle);
      unsubscribe();
    };
  }, []);

  const network = useMemo(
    () => networkForChainId(chainId ?? undefined) ?? NETWORKS[DEFAULT_NETWORK],
    [chainId],
  );

  const clearSession = useCallback(() => {
    setWallet(null);
    setWalletAccount(null);
    setAddress(null);
    setChainId(null);
    setStatus("disconnected");
    if (typeof window !== "undefined") window.localStorage.removeItem(LAST_WALLET_KEY);
  }, []);

  /**
   * Authorizes the wallet, then binds the account to the provider for whichever chain it reports.
   *
   * Order matters and is not the obvious one. Reading the chain first would let us build the account
   * against the right provider in one step, but wallets are entitled to reject *every* request until
   * the dapp is authorized — Ready answers `wallet_requestChainId` with "Not preauthorized" — so the
   * chain is unreadable before connecting. We therefore connect against the default network's
   * provider, read the chain, and rebind if it turned out to be something else. The rebind is
   * silent, because authorization already happened.
   */
  const openSession = useCallback(
    async (selected: WalletWithStarknetFeatures, silent: boolean) => {
      const fallback = NETWORKS[DEFAULT_NETWORK];
      const initial = silent
        ? await WalletAccountV6.connectSilent(providerFor(fallback), selected)
        : await WalletAccountV6.connect(providerFor(fallback), selected);

      // `standard:connect` already authorized the accounts; an address is the proof it worked, so
      // there is no need for a second `requestAccounts` round trip.
      const parsed = parseAddress(initial?.address);
      if (!parsed) throw new Error("This wallet did not return an account.");

      let chain: string | null = null;
      try {
        chain = (await walletV6.requestChainId(selected)) as string;
      } catch {
        // Readable on the next focus or change event; assume the chain we connected against.
        chain = null;
      }

      let account = initial;
      const target = chain ? networkForChainId(chain) : null;
      if (target && target.key !== fallback.key) {
        try {
          account = await WalletAccountV6.connectSilent(providerFor(target), selected);
        } catch {
          /* keep the working account rather than dropping the session over a rebind */
        }
      }

      setWallet(selected);
      setWalletAccount(account);
      setAddress(parseAddress(account?.address) ?? parsed);
      setChainId(chain ?? fallback.chainId);
      setStatus("connected");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_WALLET_KEY, selected.name);
      }
    },
    [],
  );

  const connect = useCallback(
    async (selected: WalletWithStarknetFeatures) => {
      setError(null);
      setStatus("connecting");
      try {
        await openSession(selected, false);
      } catch (err) {
        clearSession();
        const raw = err instanceof Error ? err.message : "";
        setError(
          /preauthoriz/i.test(raw)
            ? "The wallet declined the connection. Approve GhostBook in the wallet and try again."
            : raw || "Wallet connection failed.",
        );
        throw err;
      }
    },
    [openSession, clearSession],
  );

  // ── Reconnect on reload ───────────────────────────────────────────────────
  // The wallet still has us authorized after a refresh, so restore the session without a prompt.
  useEffect(() => {
    if (reconnectTried.current || status === "connected" || status === "connecting") return;
    if (typeof window === "undefined") return;

    const remembered = window.localStorage.getItem(LAST_WALLET_KEY);
    if (!remembered) {
      reconnectTried.current = true;
      return;
    }
    const match = wallets.find((w) => w.name === remembered);
    if (!match) return; // discovery may not have reported it yet

    reconnectTried.current = true;
    // Deferred for the same reason as the discovery snapshot: kick it off outside the effect body.
    const restore = window.setTimeout(() => {
      void openSession(match, true).catch(() => {
        // Authorization was revoked while we were away — forget it and stay disconnected.
        clearSession();
      });
    }, 0);
    return () => window.clearTimeout(restore);
  }, [wallets, status, openSession, clearSession]);

  // ── Follow the wallet ─────────────────────────────────────────────────────
  // Event-driven. Polling `requestAccounts` re-prompts, so the only fallback is a passive chain-id
  // re-read when the tab regains focus, for wallets that don't implement `standard:events`.
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;

    const syncChain = async () => {
      try {
        const next = (await walletV6.requestChainId(wallet)) as string;
        if (cancelled || sameChain(next, chainIdRef.current)) return;

        setChainId(next);
        // Rebuild against the new chain's provider, silently — we are already authorized.
        const target = networkForChainId(next) ?? NETWORKS[DEFAULT_NETWORK];
        const account = await WalletAccountV6.connectSilent(providerFor(target), wallet);
        if (cancelled) return;
        const parsed = parseAddress(account?.address);
        if (parsed) {
          setWalletAccount(account);
          setAddress(parsed);
        }
      } catch {
        /* wallet locked or navigated away — keep the last known state */
      }
    };

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = walletV6.subscribeWalletEvent(wallet, (change) => {
        if (cancelled) return;
        if (change.accounts !== undefined) {
          const next = parseAddress(change.accounts[0]?.address);
          // An empty account list is the wallet telling us the dapp was disconnected or locked.
          if (!next) {
            clearSession();
            return;
          }
          setAddress((current) => (current === next ? current : next));
        }
        void syncChain();
      });
    } catch {
      /* wallet doesn't implement standard:events — the focus listener below covers it */
    }

    const onFocus = () => void syncChain();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      unsubscribe?.();
    };
  }, [wallet, clearSession]);

  const switchToMainnet = useCallback(async () => {
    if (!wallet) return;
    setError(null);
    try {
      await walletV6.switchStarknetChain(wallet, MAINNET.chainId);
      // Wallets that don't emit a change event still need the state corrected.
      const next = (await walletV6.requestChainId(wallet)) as string;
      setChainId(next);
      const target = networkForChainId(next) ?? NETWORKS[DEFAULT_NETWORK];
      const account = await WalletAccountV6.connectSilent(providerFor(target), wallet);
      const parsed = parseAddress(account?.address);
      if (parsed) {
        setWalletAccount(account);
        setAddress(parsed);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not switch network. Do it in your wallet.",
      );
    }
  }, [wallet]);

  const disconnect = useCallback(() => {
    clearSession();
    setError(null);
  }, [clearSession]);

  const value = useMemo<WalletContextValue>(
    () => ({
      wallets,
      wallet,
      walletAccount,
      address,
      shortAddress: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "",
      status,
      isConnected: status === "connected" && Boolean(walletAccount && address),
      isPending: status === "connecting",
      isDiscovering: status === "discovering",
      error,
      chainId,
      network,
      isSupportedNetwork: Boolean(networkForChainId(chainId ?? undefined)?.privacyPool),
      connect,
      switchToMainnet,
      disconnect,
    }),
    [
      wallets,
      wallet,
      walletAccount,
      address,
      status,
      error,
      chainId,
      network,
      connect,
      switchToMainnet,
      disconnect,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}
