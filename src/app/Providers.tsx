"use client";

import type { ReactNode } from "react";
import { ToastProvider, useToastContext } from "@/context/ToastContext";
import { ToastContainer } from "@/components/Toast";
import { WalletProvider } from "@/context/WalletContext";

function ToastContainerWrapper() {
  const { toasts, removeToast } = useToastContext();
  return <ToastContainer toasts={toasts} onClose={removeToast} />;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <ToastProvider>
        {children}
        <ToastContainerWrapper />
      </ToastProvider>
    </WalletProvider>
  );
}
