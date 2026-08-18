"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { useState, type ReactNode } from "react";
import { ToastProvider, useToastContext } from "@/context/ToastContext";
import { ToastContainer } from "@/components/Toast";
import { wagmiConfig } from "@/lib/appkit";

function ToastContainerWrapper() {
  const { toasts, removeToast } = useToastContext();
  return <ToastContainer toasts={toasts} onClose={removeToast} />;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {children}
          <ToastContainerWrapper />
        </ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
