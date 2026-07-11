"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { ARCANA_PLEDGE_ABI, ERC20_ABI } from "@/lib/abis";
import { CONTRACTS } from "@/lib/wagmi";

const USDC_DECIMALS = 6;
const formatUSDC = (v: bigint) => (Number(v) / 10 ** USDC_DECIMALS).toFixed(2);

const TIER_LABELS = ["None", "C", "B", "A"];
const TIER_COLORS = ["text-white/40", "text-amber-500", "text-slate-300", "text-yellow-400"];
const STATUS_LABELS = ["Open", "Matched", "Resolved", "Expired"];

// Demo pledges when no contract is deployed
const DEMO_PLEDGES = [
  { id: 0, pledgor: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", counterparty: "0x0000", currentTier: 1, targetTier: 2, deadline: Date.now() / 1000 + 86400 * 20, premium: 10_000_000n, status: 0, pledgorWon: false },
  { id: 1, pledgor: "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B", counterparty: "0x1234", currentTier: 2, targetTier: 3, deadline: Date.now() / 1000 + 86400 * 25, premium: 25_000_000n, status: 1, pledgorWon: false },
  { id: 2, pledgor: "0x742d35Cc6634C0532925a3b8D4C9D5C2A44b3B2d", counterparty: "0x0000", currentTier: 1, targetTier: 3, deadline: Date.now() / 1000 + 86400 * 28, premium: 50_000_000n, status: 0, pledgorWon: false },
];

export default function PledgePage() {
  const { address, isConnected } = useAccount();
  const [showCreate, setShowCreate] = useState(false);
  const [currentTier, setCurrentTier] = useState(1);
  const [targetTier, setTargetTier] = useState(2);
  const [days, setDays] = useState(30);
  const [premium, setPremium] = useState("10");
  const [txStatus, setTxStatus] = useState<"idle" | "approving" | "tx" | "done">("idle");

  const { writeContract, data: txHash } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const { data: totalPledges } = useReadContract({
    address: CONTRACTS.arcanaPledge as `0x${string}`,
    abi: ARCANA_PLEDGE_ABI,
    functionName: "totalPledges",
    query: { enabled: !!CONTRACTS.arcanaPledge },
  });

  const pledges = DEMO_PLEDGES; // In production: fetch from contract events/subgraph

  async function handleCreatePledge() {
    if (!CONTRACTS.arcanaPledge) {
      alert("ArcanaPledge not deployed yet");
      return;
    }
    const premiumAmount = BigInt(Math.floor(parseFloat(premium) * 10 ** USDC_DECIMALS));

    setTxStatus("approving");
    try {
      writeContract({
        address: CONTRACTS.usdc as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.arcanaPledge as `0x${string}`, premiumAmount],
      });
      setTxStatus("tx");
    } catch (e: any) {
      alert(e.message);
      setTxStatus("idle");
    }
  }

  async function handleTakePledge(pledgeId: number, pledgePremium: bigint) {
    if (!CONTRACTS.arcanaPledge) {
      alert("ArcanaPledge not deployed yet");
      return;
    }
    try {
      writeContract({
        address: CONTRACTS.usdc as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.arcanaPledge as `0x${string}`, pledgePremium],
      });
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="min-h-screen gradient-bg">
      <nav className="flex items-center justify-between px-6 py-5 border-b border-white/5">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center text-xs font-bold">A</div>
          <span className="font-bold text-white">ARCANA</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/score" className="text-sm text-white/50 hover:text-white">Score</Link>
          <Link href="/lend" className="text-sm text-white/50 hover:text-white">Lend</Link>
          <ConnectButton showBalance={false} />
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Pledge Market</h1>
            <p className="text-white/40 max-w-xl">
              Bet on your own improvement. Pledge to reach a higher ZK credit tier — earn a premium if you succeed, settled trustlessly by zero-knowledge proofs.
            </p>
          </div>
          {isConnected && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-all text-sm whitespace-nowrap"
            >
              + Create Pledge
            </button>
          )}
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Novel Primitive", desc: "First derivatives market on ZK-proven personal attributes" },
            { label: "Trustless Settlement", desc: "ZK proofs resolve pledges — no human arbitration" },
            { label: "Aligned Incentives", desc: "Earn money by actually improving your on-chain behavior" },
          ].map((c) => (
            <div key={c.label} className="glass rounded-2xl p-4">
              <div className="text-xs font-mono text-violet-400 mb-1">{c.label}</div>
              <p className="text-xs text-white/50">{c.desc}</p>
            </div>
          ))}
        </div>

        {/* Create pledge modal */}
        {showCreate && (
          <div className="glass rounded-2xl p-6 mb-8 border border-violet-500/20">
            <h3 className="font-bold mb-4">Create New Pledge</h3>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-white/40 mb-2 block">Current Tier</label>
                <select
                  value={currentTier}
                  onChange={(e) => setCurrentTier(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500"
                >
                  <option value={1}>Tier C (120% ratio)</option>
                  <option value={2}>Tier B (90% ratio)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/40 mb-2 block">Target Tier</label>
                <select
                  value={targetTier}
                  onChange={(e) => setTargetTier(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500"
                >
                  {currentTier < 2 && <option value={2}>Tier B (90% ratio)</option>}
                  <option value={3}>Tier A (70% ratio)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/40 mb-2 block">Days to Achieve</label>
                <input
                  type="number"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  min={7} max={90}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 mb-2 block">Premium (USDC each side)</label>
                <input
                  type="number"
                  value={premium}
                  onChange={(e) => setPremium(e.target.value)}
                  min={1}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div className="bg-white/4 rounded-xl p-4 text-xs mb-4">
              <div className="text-white/60 mb-2">Pledge summary:</div>
              <p className="text-white/80">
                "I pledge to improve from Tier {TIER_LABELS[currentTier]} → Tier {TIER_LABELS[targetTier]} within {days} days.
                I deposit {premium} USDC. If a counterparty matches, we each stake {premium} USDC.
                I submit a ZK proof at deadline — if I've reached Tier {TIER_LABELS[targetTier]}, I win {Number(premium) * 2 * 0.98} USDC."
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCreatePledge}
                disabled={txStatus !== "idle"}
                className="px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-all"
              >
                {txStatus === "approving" ? "Approving USDC..." : txStatus === "tx" ? "Creating..." : "Create Pledge"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-6 py-3 glass text-white/60 hover:text-white font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
            </div>

            {txHash && (
              <a href={`https://explorer.hsk.xyz/tx/${txHash}`} target="_blank" rel="noreferrer"
                className="mt-2 block text-xs text-violet-400 font-mono">
                Tx: {txHash.slice(0, 16)}... ↗
              </a>
            )}
          </div>
        )}

        {/* Pledge list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Open Pledges</h2>
            <span className="text-xs text-white/30 font-mono">
              {totalPledges ? Number(totalPledges) : pledges.length} total on-chain
            </span>
          </div>

          {pledges.map((pledge) => {
            const daysLeft = Math.max(0, Math.round((pledge.deadline - Date.now() / 1000) / 86400));
            const isOpen = pledge.status === 0;
            const isMatched = pledge.status === 1;
            return (
              <div key={pledge.id} className="glass rounded-2xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        pledge.currentTier === 2 ? "bg-slate-600 text-white" : "bg-amber-900 text-white"
                      }`}>
                        Tier {TIER_LABELS[pledge.currentTier]}
                      </span>
                      <span className="text-white/30 text-sm">→</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        pledge.targetTier === 3 ? "bg-yellow-500 text-black" : "bg-slate-400 text-black"
                      }`}>
                        Tier {TIER_LABELS[pledge.targetTier]}
                      </span>
                      <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                        isOpen ? "bg-green-500/20 text-green-400" :
                        isMatched ? "bg-blue-500/20 text-blue-400" :
                        "bg-white/10 text-white/40"
                      }`}>
                        {STATUS_LABELS[pledge.status]}
                      </span>
                    </div>
                    <div className="text-xs text-white/30 font-mono">
                      {pledge.pledgor.slice(0, 8)}...{pledge.pledgor.slice(-6)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-white">{formatUSDC(pledge.premium)} USDC</div>
                    <div className="text-xs text-white/30">each side</div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-white/40">
                    <span>⏱ {daysLeft} days left</span>
                    <span>💰 Winner gets {(Number(pledge.premium) / 10 ** USDC_DECIMALS * 2 * 0.98).toFixed(2)} USDC</span>
                  </div>
                  {isOpen && address && address.toLowerCase() !== pledge.pledgor.toLowerCase() && (
                    <button
                      onClick={() => handleTakePledge(pledge.id, pledge.premium)}
                      className="px-4 py-2 bg-violet-600/30 border border-violet-500/30 hover:bg-violet-600/50 text-violet-300 text-sm font-semibold rounded-xl transition-all"
                    >
                      Take Counterparty →
                    </button>
                  )}
                  {isMatched && (
                    <span className="text-xs text-blue-400">Waiting for ZK proof resolution</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!isConnected && (
          <div className="text-center mt-8 py-10 glass rounded-2xl">
            <p className="text-white/40 mb-4">Connect wallet to create or take pledges</p>
            <ConnectButton />
          </div>
        )}
      </main>
    </div>
  );
}
