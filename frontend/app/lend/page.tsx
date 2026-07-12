"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ConnectWallet } from "@/components/ConnectWallet";
import { NavBar } from "@/components/NavBar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { TierBadge } from "@/components/ui/Badge";
import { ARCANA_CRED_ABI, ARCANA_LEND_ABI, ERC20_ABI } from "@/lib/abis";
import { CONTRACTS, EXPLORER } from "@/lib/wagmi";
import { useTxFlow } from "@/lib/useTxFlow";
import { toast } from "@/lib/toast";
import { useMounted } from "@/lib/useMounted";

const USDC_DECIMALS = 6;
const formatUSDC = (v: bigint | undefined) =>
  v !== undefined ? (Number(v) / 10 ** USDC_DECIMALS).toFixed(2) : "0.00";
const toUSDC = (v: string) => BigInt(Math.floor(parseFloat(v || "0") * 10 ** USDC_DECIMALS));

export default function LendPage() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const [mode, setMode] = useState<"borrow" | "lend">("borrow");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");

  const borrowFlow = useTxFlow();
  const depositFlow = useTxFlow();

  // Read user tier
  const { data: tier } = useReadContract({
    address: CONTRACTS.arcanaCred as `0x${string}`,
    abi: ARCANA_CRED_ABI,
    functionName: "getTier",
    args: [address as `0x${string}`],
    query: { enabled: !!address && !!CONTRACTS.arcanaCred },
  });

  // Read collateral ratio
  const { data: collateralRatio } = useReadContract({
    address: CONTRACTS.arcanaCred as `0x${string}`,
    abi: ARCANA_CRED_ABI,
    functionName: "getCollateralRatio",
    args: [address as `0x${string}`],
    query: { enabled: !!address && !!CONTRACTS.arcanaCred },
  });

  // Read position
  const { data: position, refetch: refetchPosition } = useReadContract({
    address: CONTRACTS.arcanaLend as `0x${string}`,
    abi: ARCANA_LEND_ABI,
    functionName: "getPosition",
    args: [address as `0x${string}`],
    query: { enabled: !!address && !!CONTRACTS.arcanaLend },
  });

  // Protocol stats
  const { data: totalDeposits, refetch: refetchTotalDeposits } = useReadContract({
    address: CONTRACTS.arcanaLend as `0x${string}`,
    abi: ARCANA_LEND_ABI,
    functionName: "totalDeposits",
    query: { enabled: !!CONTRACTS.arcanaLend },
  });
  const { data: totalBorrowed, refetch: refetchTotalBorrowed } = useReadContract({
    address: CONTRACTS.arcanaLend as `0x${string}`,
    abi: ARCANA_LEND_ABI,
    functionName: "totalBorrowed",
    query: { enabled: !!CONTRACTS.arcanaLend },
  });

  const tierNum = typeof tier === "number" ? tier : (Number(tier) || 0);
  const ratioNum = typeof collateralRatio === "bigint" ? Number(collateralRatio) : 150;

  const requiredCollateral = borrowAmount
    ? ((parseFloat(borrowAmount) * ratioNum) / 100).toFixed(2)
    : "0.00";

  async function refreshAll() {
    await Promise.all([refetchPosition(), refetchTotalDeposits(), refetchTotalBorrowed()]);
  }

  async function handleBorrow() {
    if (!address || !CONTRACTS.arcanaLend) {
      toast.error("ArcanaLend not deployed yet");
      return;
    }
    if (!borrowAmount || !collateralAmount) {
      toast.error("Enter both borrow and collateral amounts");
      return;
    }

    const borrow = toUSDC(borrowAmount);
    const collateral = toUSDC(collateralAmount);

    const ok = await borrowFlow.run([
      {
        label: "Approve USDC",
        address: CONTRACTS.usdc as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.arcanaLend as `0x${string}`, collateral],
      },
      {
        label: "Borrow USDC",
        address: CONTRACTS.arcanaLend as `0x${string}`,
        abi: ARCANA_LEND_ABI,
        functionName: "borrow",
        args: [borrow, collateral],
      },
    ]);

    if (ok) {
      toast.success("Borrow successful!", `You borrowed ${borrowAmount} USDC`);
      setBorrowAmount("");
      setCollateralAmount("");
      borrowFlow.reset();
      await refreshAll();
    }
  }

  async function handleDeposit() {
    if (!address || !CONTRACTS.arcanaLend) {
      toast.error("ArcanaLend not deployed yet");
      return;
    }
    if (!depositAmount) {
      toast.error("Enter a deposit amount");
      return;
    }
    const amount = toUSDC(depositAmount);

    const ok = await depositFlow.run([
      {
        label: "Approve USDC",
        address: CONTRACTS.usdc as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.arcanaLend as `0x${string}`, amount],
      },
      {
        label: "Deposit Liquidity",
        address: CONTRACTS.arcanaLend as `0x${string}`,
        abi: ARCANA_LEND_ABI,
        functionName: "depositLiquidity",
        args: [amount],
      },
    ]);

    if (ok) {
      toast.success("Deposit successful!", `You deposited ${depositAmount} USDC`);
      setDepositAmount("");
      depositFlow.reset();
      await refreshAll();
    }
  }

  if (!mounted || !isConnected) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4 text-primary">Connect Wallet</h2>
          <ConnectWallet />
        </div>
      </div>
    );
  }

  const activeFlow = mode === "borrow" ? borrowFlow : depositFlow;

  return (
    <div className="min-h-screen gradient-bg">
      <NavBar active="lend" />

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-primary">ARCANA Lending</h1>
          <p className="text-secondary">Borrow with your ZK credential — or earn yield as a lender</p>
        </div>

        {/* Protocol stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard label="Total Deposits" value={`$${formatUSDC(totalDeposits as bigint)}`} />
          <StatCard label="Total Borrowed" value={`$${formatUSDC(totalBorrowed as bigint)}`} />
          <StatCard
            label="Available"
            value={`$${totalDeposits && totalBorrowed ? formatUSDC((totalDeposits as bigint) - (totalBorrowed as bigint)) : "0.00"}`}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Credential Status */}
          <Card className="h-fit">
            <h2 className="font-semibold mb-4 text-primary">Your Credential</h2>
            {tierNum > 0 ? (
              <div className={`rounded-xl p-4 border ${
                tierNum === 3 ? "border-yellow-500/40 bg-yellow-500/10" :
                tierNum === 2 ? "border-slate-400/40 bg-slate-400/10" :
                "border-amber-700/40 bg-amber-700/10"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <TierBadge tier={tierNum} />
                  <span className="text-xs text-muted">Active ✓</span>
                </div>
                <div className="text-3xl font-bold text-primary mt-2">{ratioNum}%</div>
                <div className="text-xs text-muted">Collateral Required</div>
                <div className="mt-2 text-xs text-emerald-400">
                  You save {150 - ratioNum}% vs standard DeFi
                </div>
              </div>
            ) : (
              <div className="rounded-xl p-4 border border-white/10 bg-white/5 text-center">
                <div className="text-secondary text-sm mb-3">No credential yet</div>
                <ButtonLink href="/score" size="sm">Get ZK Credential →</ButtonLink>
              </div>
            )}

            {/* Active position */}
            {position && (position as unknown as bigint[])[1] > 0n && (
              <div className="mt-4 p-4 bg-white/5 rounded-xl">
                <div className="text-xs text-muted mb-2">Active Position</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-secondary">Collateral</span>
                    <span className="text-primary">{formatUSDC((position as unknown as bigint[])[0])} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-secondary">Borrowed</span>
                    <span className="text-primary">{formatUSDC((position as unknown as bigint[])[1])} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-secondary">Health</span>
                    <span className={(position as unknown as (bigint | boolean)[])[5] ? "text-emerald-400" : "text-red-400"}>
                      {(position as unknown as (bigint | boolean)[])[5] ? "Healthy" : "At Risk!"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Right: Borrow/Lend form */}
          <div className="space-y-4">
            <div className="flex rounded-xl overflow-hidden border border-white/10">
              <button
                onClick={() => setMode("borrow")}
                className={`flex-1 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                  mode === "borrow" ? "bg-violet-600 text-white" : "bg-white/5 text-secondary"
                }`}
              >
                Borrow
              </button>
              <button
                onClick={() => setMode("lend")}
                className={`flex-1 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                  mode === "lend" ? "bg-violet-600 text-white" : "bg-white/5 text-secondary"
                }`}
              >
                Lend
              </button>
            </div>

            <Card>
              {mode === "borrow" ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-secondary mb-2 block">Borrow Amount (USDC)</label>
                    <input
                      type="number"
                      value={borrowAmount}
                      onChange={(e) => setBorrowAmount(e.target.value)}
                      placeholder="100.00"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-primary placeholder-white/20 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-secondary mb-2 block">
                      Collateral (USDC) — min required: {requiredCollateral}
                    </label>
                    <input
                      type="number"
                      value={collateralAmount}
                      onChange={(e) => setCollateralAmount(e.target.value)}
                      placeholder={requiredCollateral}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-primary placeholder-white/20 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3 text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-muted">Your collateral ratio</span>
                      <span className="text-violet-300">{ratioNum}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">APR</span>
                      <span className="text-primary">5%</span>
                    </div>
                  </div>
                  <Button onClick={handleBorrow} loading={borrowFlow.status === "pending"} disabled={borrowFlow.status === "pending"} className="w-full">
                    {borrowFlow.status === "pending" ? `${borrowFlow.stepLabel} (${borrowFlow.stepIndex}/${borrowFlow.totalSteps})` : "Borrow USDC"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-secondary mb-2 block">Deposit Amount (USDC)</label>
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="500.00"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-primary placeholder-white/20 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-muted">Estimated APY</span>
                      <span className="text-emerald-400">5%+</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Utilization</span>
                      <span className="text-primary">{totalDeposits && totalBorrowed ? Math.round((Number(totalBorrowed) / Number(totalDeposits)) * 100) : 57}%</span>
                    </div>
                  </div>
                  <Button onClick={handleDeposit} loading={depositFlow.status === "pending"} disabled={depositFlow.status === "pending"} className="w-full">
                    {depositFlow.status === "pending" ? `${depositFlow.stepLabel} (${depositFlow.stepIndex}/${depositFlow.totalSteps})` : "Deposit & Earn"}
                  </Button>
                </div>
              )}

              {activeFlow.txHash && (
                <div className="mt-4 text-center">
                  <a
                    href={`${EXPLORER}/tx/${activeFlow.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-violet-400 hover:text-violet-300 font-mono"
                  >
                    View Tx: {activeFlow.txHash.slice(0, 16)}... ↗
                  </a>
                </div>
              )}

              {activeFlow.status === "error" && activeFlow.error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                  {activeFlow.error}
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
