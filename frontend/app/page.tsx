"use client";

import { useAccount } from "wagmi";
import { ConnectWallet } from "@/components/ConnectWallet";
import { NavBar } from "@/components/NavBar";
import { ButtonLink } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/Card";
import { EXPLORER } from "@/lib/wagmi";
import { useMounted } from "@/lib/useMounted";

const STATS = [
  { label: "Proofs Generated", value: "1,248" },
  { label: "Total Credentials", value: "847" },
  { label: "USDC Unlocked", value: "$2.4M" },
  { label: "Active Pledges", value: "142" },
];

const TIER_CARDS = [
  {
    tier: "A",
    score: "850+",
    ratio: "70%",
    color: "from-yellow-500/20 to-yellow-600/5",
    border: "border-yellow-500/40",
    glow: "shadow-yellow-500/20",
    badge: "bg-yellow-500 text-black",
    desc: "Elite DeFi history. Borrow with just 70% collateral — 2.1× your capital efficiency.",
  },
  {
    tier: "B",
    score: "700–849",
    ratio: "90%",
    color: "from-slate-400/20 to-slate-500/5",
    border: "border-slate-400/40",
    glow: "shadow-slate-400/20",
    badge: "bg-slate-400 text-black",
    desc: "Solid on-chain reputation. 90% ratio is still dramatically better than DeFi default.",
  },
  {
    tier: "C",
    score: "500–699",
    ratio: "120%",
    color: "from-amber-700/20 to-amber-800/5",
    border: "border-amber-700/40",
    glow: "shadow-amber-700/20",
    badge: "bg-amber-700 text-white",
    desc: "Growing history. 120% vs 150% default — and create a Pledge to improve.",
  },
];

export default function Home() {
  const mounted = useMounted();
  const { isConnected } = useAccount();

  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <NavBar />

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-28 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-mono mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 pulse-dot" />
          HashKey Chain Testnet · zkML Powered
        </div>

        <h1 className="text-6xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
          <span className="text-primary">Invisible inputs.</span>
          <br />
          <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
            Verifiable outputs.
          </span>
          <br />
          <span className="text-secondary">Tradeable facts.</span>
        </h1>

        <p className="text-xl text-secondary max-w-2xl mx-auto mb-12 leading-relaxed">
          ARCANA uses zero-knowledge machine learning to prove your DeFi creditworthiness
          without revealing your data. Your ZK credential unlocks under-collateralized borrowing
          and a new market — betting on your own improvement.
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          {mounted && isConnected ? (
            <ButtonLink href="/score" size="lg" className="glow-purple">
              Generate My ZK Proof →
            </ButtonLink>
          ) : (
            <ConnectWallet />
          )}
          <ButtonLink href="/pledge" size="lg" variant="secondary">
            View Pledge Market
          </ButtonLink>
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {STATS.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-3xl font-bold text-center mb-4 text-primary">How ARCANA Works</h2>
        <p className="text-muted text-center mb-12 max-w-xl mx-auto">
          A 3-step flow from private signals to on-chain credit
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              step: "01",
              title: "Submit Private Signals",
              desc: "Your on-chain history (wallet age, transaction count, DeFi protocols) is computed locally. Nothing is revealed to the server.",
              icon: "🔒",
            },
            {
              step: "02",
              title: "EZKL Generates ZK Proof",
              desc: "A zero-knowledge proof is generated that our credit model ran on your private inputs and produced a score — without revealing the inputs or model weights.",
              icon: "⚡",
            },
            {
              step: "03",
              title: "Proof Verified On-Chain",
              desc: "The ZK proof is verified by a Halo2 smart contract on HashKey Chain. If valid, a soulbound credential NFT is minted — unlocking better collateral ratios.",
              icon: "✓",
            },
          ].map((item) => (
            <div key={item.step} className="glass rounded-2xl p-8 relative">
              <div className="text-4xl mb-4">{item.icon}</div>
              <div className="text-xs font-mono text-violet-400 mb-2">{item.step}</div>
              <h3 className="text-lg font-bold mb-3 text-primary">{item.title}</h3>
              <p className="text-secondary text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tiers */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-3xl font-bold text-center mb-4 text-primary">Credential Tiers</h2>
        <p className="text-muted text-center mb-12 max-w-xl mx-auto">
          Your ZK-proven credit score determines your borrowing power
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {TIER_CARDS.map((t) => (
            <div
              key={t.tier}
              className={`rounded-2xl p-8 bg-gradient-to-b ${t.color} border ${t.border} shadow-xl ${t.glow} relative`}
            >
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-3 py-1 rounded-lg text-sm font-bold ${t.badge}`}>
                  TIER {t.tier}
                </span>
                <span className="text-muted text-sm font-mono">{t.score}</span>
              </div>
              <div className="text-4xl font-bold text-primary mb-2">{t.ratio}</div>
              <div className="text-muted text-sm mb-4">Collateral Required</div>
              <p className="text-secondary text-sm leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 text-center text-muted text-sm">
          Standard DeFi: <span className="text-secondary line-through">150%</span> collateral required for any borrow
        </div>
      </section>

      {/* Pledge market teaser */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-24">
        <div className="glass-dark rounded-3xl p-10 text-center border border-violet-500/20">
          <div className="text-xs font-mono text-violet-400 mb-3 uppercase tracking-widest">Novel Financial Primitive</div>
          <h2 className="text-3xl font-bold mb-4 text-primary">Bet on Your Future Self</h2>
          <p className="text-secondary max-w-lg mx-auto mb-8 leading-relaxed">
            The ARCANA Pledge Market lets you tokenize self-improvement. Pledge to reach a higher
            credit tier, earn a premium if you succeed — all settled trustlessly by ZK proofs.
            A derivatives market on personal attributes that has never existed before.
          </p>
          <ButtonLink href="/pledge" variant="secondary">
            Explore Pledge Market →
          </ButtonLink>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 px-6 py-8 text-center text-muted text-sm">
        <div className="flex items-center justify-center gap-6 mb-4 flex-wrap">
          <span className="font-mono">HashKey Chain Testnet · ChainID 133</span>
          <span>|</span>
          <a href={EXPLORER} target="_blank" rel="noreferrer" className="hover:text-secondary transition-colors">
            Explorer ↗
          </a>
          <span>|</span>
          <span className="font-mono">EZKL · Halo2 · zkML</span>
        </div>
        <p>ARCANA Protocol · HashKey Chain Horizon Hackathon 2026</p>
        <p className="mt-2 text-white/10 font-mono text-xs">
          &ldquo;Truth is the new collateral. We proved it with math.&rdquo;
        </p>
      </footer>
    </div>
  );
}
