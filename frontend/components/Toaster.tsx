"use client";

import { useEffect, useState } from "react";
import { subscribeToast, dismissToast, type ToastItem } from "@/lib/toast";

const ICON: Record<ToastItem["kind"], string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
};

const ICON_STYLE: Record<ToastItem["kind"], string> = {
  success: "bg-emerald-500/20 text-emerald-300",
  error: "bg-red-500/20 text-red-300",
  info: "bg-violet-500/20 text-violet-300",
};

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToast(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 w-[22rem] pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="glass-dark rounded-2xl p-4 shadow-2xl flex items-start gap-3 animate-slide-up pointer-events-auto"
        >
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${ICON_STYLE[t.kind]}`}>
            {ICON[t.kind]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-primary">{t.title}</div>
            {t.description && <div className="text-xs text-secondary mt-0.5">{t.description}</div>}
            {t.link && (
              <a
                href={t.link}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-violet-400 hover:text-violet-300 font-mono mt-1 inline-block"
              >
                View on Explorer ↗
              </a>
            )}
          </div>
          <button
            onClick={() => dismissToast(t.id)}
            className="text-muted hover:text-white text-xs cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
