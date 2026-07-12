const TIER_STYLES = [
  { badge: "bg-white/15 text-white/70", ring: "border-white/15", label: "Unverified" },
  { badge: "bg-amber-700 text-white", ring: "border-amber-700/40", label: "Tier C" },
  { badge: "bg-slate-400 text-black", ring: "border-slate-400/40", label: "Tier B" },
  { badge: "bg-yellow-500 text-black", ring: "border-yellow-500/40", label: "Tier A" },
];

export function TierBadge({ tier, size = "md" }: { tier: number; size?: "sm" | "md" }) {
  const cfg = TIER_STYLES[tier] ?? TIER_STYLES[0];
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span className={`rounded-lg font-bold ${sizeClass} ${cfg.badge}`}>
      {cfg.label}
    </span>
  );
}

type StatusKind = "pending" | "confirmed" | "failed" | "open" | "matched" | "resolved" | "expired";

const STATUS_STYLES: Record<StatusKind, string> = {
  pending: "bg-violet-500/15 text-violet-300",
  confirmed: "bg-emerald-500/15 text-emerald-300",
  failed: "bg-red-500/15 text-red-300",
  open: "bg-emerald-500/15 text-emerald-300",
  matched: "bg-violet-500/15 text-violet-300",
  resolved: "bg-white/10 text-white/50",
  expired: "bg-red-500/15 text-red-300",
};

export function StatusBadge({ status, className = "" }: { status: StatusKind; className?: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[status]} ${className}`}>
      {status}
    </span>
  );
}
