"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { ConnectWallet } from "@/components/ConnectWallet";
import { NavBar } from "@/components/NavBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge, TierBadge } from "@/components/ui/Badge";
import { ARCANA_PLEDGE_ABI, ERC20_ABI } from "@/lib/abis";
import { CONTRACTS, EXPLORER } from "@/lib/wagmi";
import { useTxFlow } from "@/lib/useTxFlow";
import { toast } from "@/lib/toast";
import { useMounted } from "@/lib/useMounted";

const USDC_DECIMALS = 6;
const formatUSDC = (v: bigint) => (Number(v) / 10 ** USDC_DECIMALS).toFixed(2);
const toUSDC = (v: string) => BigInt(Math.floor(parseFloat(v || "0") * 10 ** USDC_DECIMALS));

const TIER_LABELS = ["None", "C", "B", "A"];

// viem decodes a single tuple/struct return value whose components are ALL
// named (like ArcanaPledge.Pledge) into a plain named object, not an array —
// so positional access like `p[0]` is silently `undefined`. Access fields by
// name instead.
interface PledgeStruct {
  pledgor: string;
  counterparty: string;
  currentTier: number;
  targetTier: number;
  deadline: bigint;
  premium: bigint;
  status: number;
  pledgorWon: boolean;
}

interface Pledge {
  id: number;
  pledgor: string;
  counterparty: string;
  currentTier: number;
  targetTier: number;
  deadline: number;
  premium: bigint;
  status: number;
  pledgorWon: boolean;
}

const STATUS_LABELS = ["open", "matched", "resolved", "expired"] as const;

export default function PledgePage() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const [showCreate, setShowCreate] = useState(false);
  const [currentTier, setCurrentTier] = useState(1);
  const [targetTier, setTargetTier] = useState(2);
  const [days, setDays] = useState(30);
  const [premium, setPremium] = useState("10");
  const [busyPledgeId, setBusyPledgeId] = useState<number | null>(null);

  const create = useTxFlow();
  const take = useTxFlow();

  const pledgeDeployed = !!CONTRACTS.arcanaPledge;

  const { data: totalPledges, refetch: refetchTotal } = useReadContract({
    address: CONTRACTS.arcanaPledge as `0x${string}`,
    abi: ARCANA_PLEDGE_ABI,
    functionName: "totalPledges",
    query: { enabled: pledgeDeployed },
  });

  const count = totalPledges ? Number(totalPledges) : 0;

  const { data: pledgeResults, refetch: refetchPledges } = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: CONTRACTS.arcanaPledge as `0x${string}`,
      abi: ARCANA_PLEDGE_ABI,
      functionName: "getPledge",
      args: [BigInt(i)],
    })),
    query: { enabled: pledgeDeployed && count > 0 },
  });

  const pledges: Pledge[] = useMemo(() => {
    if (!pledgeResults) return [];
    return pledgeResults
      .map((r, i) => {
        if (r.status !== "success" || !r.result) return null;
        const p = r.result as unknown as PledgeStruct;
        return {
          id: i,
          pledgor: p.pledgor,
          counterparty: p.counterparty,
          currentTier: p.currentTier,
          targetTier: p.targetTier,
          deadline: Number(p.deadline),
          premium: p.premium,
          status: p.status,
          pledgorWon: p.pledgorWon,
        };
      })
      .filter((p): p is Pledge => p !== null)
      .sort((a, b) => b.id - a.id);
  }, [pledgeResults]);

  async function refreshAll() {
    await Promise.all([refetchTotal(), refetchPledges()]);
  }

  async function handleCreatePledge() {
    if (!pledgeDeployed || !address) {
      toast.error("ArcanaPledge not deployed yet");
      return;
    }
    const premiumAmount = toUSDC(premium);
    if (premiumAmount <= 0n) {
      toast.error("Enter a valid premium amount");
      return;
    }

    const ok = await create.run([
      {
        label: "Approve USDC",
        address: CONTRACTS.usdc as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.arcanaPledge as `0x${string}`, premiumAmount],
      },
      {
        label: "Create Pledge",
        address: CONTRACTS.arcanaPledge as `0x${string}`,
        abi: ARCANA_PLEDGE_ABI,
        functionName: "createPledge",
        args: [currentTier, targetTier, days, premiumAmount],
      },
    ]);

    if (ok) {
      toast.success("Pledge created!", "Your pledge is now open for a counterparty");
      setShowCreate(false);
      create.reset();
      await refreshAll();
    }
  }

  async function handleTakePledge(pledge: Pledge) {
    if (!pledgeDeployed || !address) {
      toast.error("ArcanaPledge not deployed yet");
      return;
    }
    setBusyPledgeId(pledge.id);
    const ok = await take.run([
      {
        label: "Approve USDC",
        address: CONTRACTS.usdc as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.arcanaPledge as `0x${string}`, pledge.premium],
      },
      {
        label: "Take Counterparty",
        address: CONTRACTS.arcanaPledge as `0x${string}`,
        abi: ARCANA_PLEDGE_ABI,
        functionName: "takePledge",
        args: [BigInt(pledge.id)],
      },
    ]);

    if (ok) {
      toast.success("You're now the counterparty!", `Pledge #${pledge.id} matched`);
      take.reset();
      await refreshAll();
    }
    setBusyPledgeId(null);
  }

  const isCreating = create.status === "pending";

  return (
    <div className="min-h-screen gradient-bg">
      <NavBar active="pledge" />

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-primary">Pledge Market</h1>
            <p className="text-secondary max-w-xl">
              Bet on your own improvement. Pledge to reach a higher ZK credit tier — earn a premium if you succeed, settled trustlessly by zero-knowledge proofs.
            </p>
          </div>
          {mounted && isConnected && (
            <Button onClick={() => setShowCreate(!showCreate)}>+ Create Pledge</Button>
          )}
        </div>

        {!pledgeDeployed && (
          <div className="mb-8 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm">
            ArcanaPledge contract address is not configured — pledges are read-only until deployed.
          </div>
        )}

        {/* Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { label: "Novel Primitive", desc: "First derivatives market on ZK-proven personal attributes" },
            { label: "Trustless Settlement", desc: "ZK proofs resolve pledges — no human arbitration" },
            { label: "Aligned Incentives", desc: "Earn money by actually improving your on-chain behavior" },
          ].map((c) => (
            <div key={c.label} className="glass rounded-2xl p-4">
              <div className="text-xs font-mono text-violet-400 mb-1">{c.label}</div>
              <p className="text-xs text-secondary">{c.desc}</p>
            </div>
          ))}
        </div>

        {/* Create pledge modal */}
        {showCreate && (
          <Card className="mb-8 border border-violet-500/20">
            <h3 className="font-bold mb-4 text-primary">Create New Pledge</h3>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-muted mb-2 block">Current Tier</label>
                <select
                  value={currentTier}
                  onChange={(e) => setCurrentTier(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-primary focus:outline-none focus:border-violet-500"
                >
                  <option value={1}>Tier C (120% ratio)</option>
                  <option value={2}>Tier B (90% ratio)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted mb-2 block">Target Tier</label>
                <select
                  value={targetTier}
                  onChange={(e) => setTargetTier(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-primary focus:outline-none focus:border-violet-500"
                >
                  {currentTier < 2 && <option value={2}>Tier B (90% ratio)</option>}
                  <option value={3}>Tier A (70% ratio)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted mb-2 block">Days to Achieve</label>
                <input
                  type="number"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  min={7} max={90}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-primary focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-xs text-muted mb-2 block">Premium (USDC each side)</label>
                <input
                  type="number"
                  value={premium}
                  onChange={(e) => setPremium(e.target.value)}
                  min={1}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-primary focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div className="bg-white/[4%] rounded-xl p-4 text-xs mb-4">
              <div className="text-secondary mb-2">Pledge summary:</div>
              <p className="text-secondary">
                &ldquo;I pledge to improve from Tier {TIER_LABELS[currentTier]} → Tier {TIER_LABELS[targetTier]} within {days} days.
                I deposit {premium} USDC. If a counterparty matches, we each stake {premium} USDC.
                I submit a ZK proof at deadline — if I&apos;ve reached Tier {TIER_LABELS[targetTier]}, I win {(Number(premium) * 2 * 0.98).toFixed(2)} USDC.&rdquo;
              </p>
            </div>

            {isCreating && (
              <div className="mb-4 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-sm text-violet-300 flex items-center gap-3">
                <span className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                Step {create.stepIndex}/{create.totalSteps}: {create.stepLabel}...
              </div>
            )}
            {create.status === "error" && create.error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {create.error}
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={handleCreatePledge} loading={isCreating} disabled={isCreating}>
                {isCreating ? create.stepLabel : "Create Pledge"}
              </Button>
              <Button variant="secondary" onClick={() => { setShowCreate(false); create.reset(); }} disabled={isCreating}>
                Cancel
              </Button>
            </div>

            {create.txHash && (
              <a href={`${EXPLORER}/tx/${create.txHash}`} target="_blank" rel="noreferrer"
                className="mt-2 block text-xs text-violet-400 font-mono">
                Tx: {create.txHash.slice(0, 16)}... ↗
              </a>
            )}
          </Card>
        )}

        {/* Pledge list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-primary">Open Pledges</h2>
            <span className="text-xs text-muted font-mono">{count} total on-chain</span>
          </div>

          {pledges.length === 0 && (
            <Card className="text-center py-10">
              <p className="text-muted">
                {pledgeDeployed ? "No pledges yet — be the first to create one." : "Pledge contract not deployed."}
              </p>
            </Card>
          )}

          {pledges.map((pledge) => {
            // eslint-disable-next-line react-hooks/purity -- deadline countdown is inherently time-based
            const daysLeft = Math.max(0, Math.round((pledge.deadline - Date.now() / 1000) / 86400));
            const isOpen = pledge.status === 0;
            const isMatched = pledge.status === 1;
            const isMine = address && address.toLowerCase() === pledge.pledgor.toLowerCase();
            const isCounterparty = address && address.toLowerCase() === pledge.counterparty.toLowerCase();
            const isTaking = take.status === "pending" && busyPledgeId === pledge.id;

            return (
              <Card key={pledge.id}>
                <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <TierBadge tier={pledge.currentTier} size="sm" />
                      <span className="text-muted text-sm">→</span>
                      <TierBadge tier={pledge.targetTier} size="sm" />
                      <StatusBadge status={STATUS_LABELS[pledge.status]} />
                      {isMine && <span className="text-xs text-violet-400">You created this</span>}
                      {isCounterparty && <span className="text-xs text-violet-400">You&apos;re the counterparty</span>}
                    </div>
                    <div className="text-xs text-muted font-mono">
                      {pledge.pledgor.slice(0, 8)}...{pledge.pledgor.slice(-6)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-primary">{formatUSDC(pledge.premium)} USDC</div>
                    <div className="text-xs text-muted">each side</div>
                  </div>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4 text-xs text-secondary">
                    <span>⏱ {daysLeft} days left</span>
                    <span>💰 Winner gets {(Number(pledge.premium) / 10 ** USDC_DECIMALS * 2 * 0.98).toFixed(2)} USDC</span>
                  </div>
                  {isOpen && address && !isMine && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleTakePledge(pledge)}
                      loading={isTaking}
                      disabled={isTaking}
                    >
                      {isTaking ? take.stepLabel : "Take Counterparty →"}
                    </Button>
                  )}
                  {isMatched && (
                    <span className="text-xs text-violet-400">Waiting for ZK proof resolution</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {mounted && !isConnected && (
          <div className="text-center mt-8 py-10 glass rounded-2xl">
            <p className="text-secondary mb-4">Connect wallet to create or take pledges</p>
            <ConnectWallet />
          </div>
        )}
      </main>
    </div>
  );
}
