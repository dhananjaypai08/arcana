"use client";

export type ActivityStatus = "pending" | "confirmed" | "failed";

export interface ActivityItem {
  id: string;
  address: string;
  type: string;
  hash?: string;
  status: ActivityStatus;
  detail?: string;
  timestamp: number;
}

const STORAGE_KEY = "arcana_activity_log";
const EVENT_NAME = "arcana-activity-update";
const MAX_ITEMS = 200;

function readAll(): ActivityItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(items: ActivityItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function addActivity(address: string, entry: Omit<ActivityItem, "id" | "address" | "timestamp">): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const items = readAll();
  items.push({ id, address: address.toLowerCase(), timestamp: Date.now(), ...entry });
  writeAll(items);
  return id;
}

export function updateActivity(id: string, patch: Partial<ActivityItem>) {
  const items = readAll();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return;
  items[idx] = { ...items[idx], ...patch };
  writeAll(items);
}

export function getActivity(address?: string | null): ActivityItem[] {
  const items = readAll();
  const filtered = address ? items.filter((i) => i.address === address.toLowerCase()) : items;
  return filtered.sort((a, b) => b.timestamp - a.timestamp);
}

export function clearActivity(address: string) {
  const items = readAll().filter((i) => i.address !== address.toLowerCase());
  writeAll(items);
}

export function subscribeActivity(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT_NAME, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT_NAME, cb);
    window.removeEventListener("storage", cb);
  };
}
