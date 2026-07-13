"use client";

import { useState, useRef, useEffect } from "react";
import { useAccount } from "wagmi";
import { useActivity } from "@/lib/useActivity";
import { StatusBadge } from "@/components/ui/Badge";
import { EXPLORER } from "@/lib/wagmi";
import { DropdownPortal } from "@/components/ui/DropdownPortal";
import Link from "next/link";

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ActivityPanel() {
  const { address, isConnected } = useAccount();
  const activity = useActivity(address);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const pendingCount = activity.filter((a) => a.status === "pending").length;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- required mount guard to avoid SSR/client hydration mismatch for wallet state
    setMounted(true);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Element;
      // Dropdown content is portaled to document.body (see DropdownPortal),
      // so it's no longer a DOM descendant of `ref` — treat clicks inside the
      // portal as "inside" too, or every click on an activity row would
      // register as "outside" and close the panel before it registers.
      const insideAnchor = ref.current?.contains(target);
      const insidePortal = target.closest?.("[data-dropdown-portal]");
      if (!insideAnchor && !insidePortal) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Wagmi restores the previous wallet connection on the client only, after
  // hydration — always render nothing on the server/first paint to avoid a
  // server/client mismatch here, matching ConnectWallet's mount-guard.
  if (!mounted || !isConnected) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl glass glass-hover text-secondary hover:text-primary cursor-pointer"
        title="Activity"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-500 text-[10px] font-bold flex items-center justify-center text-white pulse-dot">
            {pendingCount}
          </span>
        )}
      </button>

      <DropdownPortal
        anchorRef={ref}
        open={open}
        className="w-80 max-h-96 overflow-y-auto glass-dark rounded-2xl shadow-2xl animate-slide-up"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="text-sm font-semibold text-primary">Recent Activity</span>
          <Link href="/profile" onClick={() => setOpen(false)} className="text-xs text-violet-400 hover:text-violet-300">
            View all →
          </Link>
        </div>
        {activity.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted">No activity yet</div>
        ) : (
          <div className="divide-y divide-white/5">
            {activity.slice(0, 8).map((item) => (
              <a
                key={item.id}
                href={item.hash ? `${EXPLORER}/tx/${item.hash}` : undefined}
                target="_blank"
                rel="noreferrer"
                className="block px-4 py-3 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-primary font-medium">{item.type}</span>
                  <StatusBadge status={item.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{item.detail || (item.hash ? `${item.hash.slice(0, 10)}...` : "")}</span>
                  <span>{timeAgo(item.timestamp)}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </DropdownPortal>
    </div>
  );
}
