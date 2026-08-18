"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  message: string | ReactNode;
  type: ToastType;
  duration?: number;
  title?: string;
}

interface ToastCardProps {
  toast: Toast;
  onClose: (id: string) => void;
}

const TYPE_STYLES: Record<
  ToastType,
  {
    icon: typeof CheckCircle2;
    iconClass: string;
    bar: string;
    label: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-primary",
    bar: "bg-primary",
    label: "Confirmed",
  },
  error: {
    icon: AlertCircle,
    iconClass: "text-danger",
    bar: "bg-danger",
    label: "Error",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-warning",
    bar: "bg-warning",
    label: "Warning",
  },
  info: {
    icon: Info,
    iconClass: "text-text-secondary",
    bar: "bg-text-tertiary",
    label: "Status",
  },
};

export function ToastCard({ toast, onClose }: ToastCardProps) {
  const duration = toast.duration ?? 4200;
  const style = TYPE_STYLES[toast.type];
  const Icon = style.icon;
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (duration <= 0) return;
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - start;
      setProgress(Math.max(0, 100 - (elapsed / duration) * 100));
      if (elapsed < duration) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const timer = setTimeout(() => onClose(toast.id), duration);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [toast.id, duration, onClose]);

  return (
    <div
      role="status"
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      className="relative overflow-hidden w-[min(100%,320px)] rounded-2xl bg-surface border border-border"
    >
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${style.bar}`} />

      <div className="flex items-start gap-3 pl-3.5 pr-2.5 py-3">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 border border-border ${style.iconClass}`}
        >
          <Icon className="w-4 h-4" strokeWidth={2.25} />
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-0.5">
            {toast.title || style.label}
          </p>
          <div className="text-[13px] text-foreground leading-snug break-words font-medium">
            {toast.message}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onClose(toast.id)}
          className="shrink-0 p-1.5 rounded-lg text-text-tertiary hover:text-foreground hover:bg-surface-2 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {duration > 0 ? (
        <div className="h-[2px] w-full bg-surface-2">
          <div
            className={`h-full ${style.bar} transition-[width] duration-75 ease-linear`}
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div
      className="fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-[100] flex flex-col-reverse gap-2.5 pointer-events-none max-w-[calc(100vw-2rem)]"
      aria-label="Notifications"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 28, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="pointer-events-auto"
          >
            <ToastCard toast={toast} onClose={onClose} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
