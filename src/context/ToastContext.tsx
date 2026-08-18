"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { Toast, ToastType } from "@/components/Toast";
import { friendlyError } from "@/lib/errors";

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string | ReactNode, type?: ToastType, duration?: number) => void;
  showSuccess: (message: string | ReactNode, duration?: number) => void;
  showError: (message: string | ReactNode, duration?: number) => void;
  showInfo: (message: string | ReactNode, duration?: number) => void;
  showWarning: (message: string | ReactNode, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string | ReactNode, type: ToastType = "info", duration?: number) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: Toast = {
        id,
        message,
        type,
        duration,
      };

      setToasts((prev) => {
        const next = [...prev, newToast];
        // Keep the latest 3 toasts so the stack stays readable
        return next.length > 3 ? next.slice(next.length - 3) : next;
      });
    },
    []
  );

  const showSuccess = useCallback(
    (message: string | ReactNode, duration?: number) => {
      showToast(message, "success", duration);
    },
    [showToast]
  );

  const showError = useCallback(
    (message: string | ReactNode, duration?: number) => {
      const text =
        typeof message === "string" ? friendlyError(message) : message;
      showToast(text, "error", duration);
    },
    [showToast]
  );

  const showInfo = useCallback(
    (message: string | ReactNode, duration?: number) => {
      showToast(message, "info", duration);
    },
    [showToast]
  );

  const showWarning = useCallback(
    (message: string | ReactNode, duration?: number) => {
      showToast(message, "warning", duration);
    },
    [showToast]
  );

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        showSuccess,
        showError,
        showInfo,
        showWarning,
        removeToast,
      }}
    >
      {children}
    </ToastContext.Provider>
  );
}

export function useToastContext() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToastContext must be used within a ToastProvider");
  }
  return context;
}

/** Alias for GhostBook pages — same theme toast API. */
export function useToast() {
  return useToastContext();
}
