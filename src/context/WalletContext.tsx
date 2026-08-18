"use client";

import React, { createContext, useContext, useCallback } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useAppKit } from "@reown/appkit/react";

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  shortAddress: string;
  connect: () => void;
  disconnect: () => void;
  isPending: boolean;
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  isConnected: false,
  shortAddress: "",
  connect: () => {},
  disconnect: () => {},
  isPending: false,
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { address: accountAddress, isConnected, status } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { open } = useAppKit();

  const address = accountAddress ?? null;
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";
  const isPending = status === "connecting" || status === "reconnecting";

  const disconnect = useCallback(() => {
    wagmiDisconnect();
  }, [wagmiDisconnect]);

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: !!isConnected,
        shortAddress,
        connect: () => open(),
        disconnect,
        isPending,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
