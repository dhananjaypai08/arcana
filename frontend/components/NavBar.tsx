"use client";

import Link from "next/link";
import Image from "next/image";
import { ConnectWallet } from "@/components/ConnectWallet";
import { ActivityPanel } from "@/components/ActivityPanel";

const LINKS = [
  { href: "/score", label: "Score" },
  { href: "/lend", label: "Lend" },
  { href: "/pledge", label: "Pledge" },
  { href: "/profile", label: "Profile" },
];

export function NavBar({ active }: { active?: string }) {
  return (
    <nav className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-white/5">
      <Link href="/" className="flex items-center gap-3">
        <Image src="/logo.png" alt="ARCANA" width={32} height={32} className="w-8 h-8 rounded-lg" priority />
        <span className="font-bold text-primary tracking-tight">ARCANA</span>
      </Link>
      <div className="flex items-center gap-6">
        <div className="hidden md:flex items-center gap-6">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm transition-colors ${
                active === l.label.toLowerCase() ? "text-primary font-semibold" : "text-secondary hover:text-primary"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <ActivityPanel />
        <ConnectWallet />
      </div>
    </nav>
  );
}
