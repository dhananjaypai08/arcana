import { HTMLAttributes } from "react";

export function Card({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass rounded-2xl p-6 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-5 text-center">
      <div className="text-2xl font-bold text-primary">{value}</div>
      <div className="text-xs text-muted font-mono uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}
