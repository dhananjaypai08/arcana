"use client";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  link?: string;
}

type Listener = (items: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let listeners: Listener[] = [];

function emit() {
  listeners.forEach((l) => l(toasts));
}

export function subscribeToast(listener: Listener) {
  listeners.push(listener);
  listener(toasts);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function push(kind: ToastKind, title: string, description?: string, link?: string) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  toasts = [...toasts, { id, kind, title, description, link }];
  emit();
  setTimeout(() => dismissToast(id), 7000);
  return id;
}

export const toast = {
  success: (title: string, description?: string, link?: string) => push("success", title, description, link),
  error: (title: string, description?: string, link?: string) => push("error", title, description, link),
  info: (title: string, description?: string, link?: string) => push("info", title, description, link),
};
