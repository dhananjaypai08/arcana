"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { ARCANA_CRED_ABI, ARCANA_LEND_ABI, ERC20_ABI } from "@/lib/abis";
import { CONTRACTS } from "@/lib/wagmi";
import { getTierConfig } from "@/lib/api";

const USDC_DECIMALS = 6;
const formatUSDC = (v: bigint | undefined) =>
  v !== undefined ? (Number(v) / 10 ** USDC_DECIMALS).toFixed(2) : "0.00";

export default function LendPage() {
  const { address, isConnected } = useAccount();
  const [mode, setMode] = useState<"borrow" | "lend">("borrow");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "approving" | "tx" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { writeContract, data: txHash } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

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
  const { data: position } = useReadContract({
    address: CONTRACTS.arcanaLend as `0x${string}`,
    abi: ARCANA_LEND_ABI,
    functionName: "getPosition",
    args: [address as `0x${string}`],
    query: { enabled: !!address && !!CONTRACTS.arcanaLend },
  });

  // Protocol stats
  const { data: totalDeposits } = useReadContract({
    address: CONTRACTS.arcanaLend as `0x${string}`,
    abi: ARCANA_LEND_ABI,
    functionName: "totalDeposits",
    query: { enabled: !!CONTRACTS.arcanaLend },
  });
  const { data: totalBorrowed } = useReadContract({
    address: CONTRACTS.arcanaLend as `0x${string}`,
    abi: ARCANA_LEND_ABI,
    functionName: "totalBorrowed",
    query: { enabled: !!CONTRACTS.arcanaLend },
  });

  const tierNum = typeof tier === "number" ? tier : (Number(tier) || 0);
  const ratioNum = typeof collateralRatio === "bigint" ? Number(collateralRatio) : 150;
  const tierCfg = getTierConfig(tierNum);

  const requiredCollateral = borrowAmount
    ? ((parseFloat(borrowAmount) * ratioNum) / 100).toFixed(2)
    : "0.00";

  async function handleBorrow() {
    if (!address || !CONTRACTS.arcanaLend) {
      alert("Contract not deployed yet — please deploy first");
      return;
    }
    if (!borrowAmount || !collateralAmount) return;

    setTxStatus("approving");
    setErrorMsg(null);
    try {
      const borrow = BigInt(Math.floor(parseFloat(borrowAmount) * 10 ** USDC_DECIMALS));
      const collateral = BigInt(Math.floor(parseFloat(collateralAmount) * 10 ** USDC_DECIMALS));

      // First approve USDC
      writeContract({
        address: CONTRACTS.usdc as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.arcanaLend as `0x${string}`, collateral],
      });
      setTxStatus("tx");
    } catch (e: any) {
      setErrorMsg(e.message);
      setTxStatus("error");
    }
  }

  async function handleDeposit() {
    if (!address || !CONTRACTS.arcanaLend) {
      alert("Contract not deployed yet");
      return;
    }
    if (!depositAmount) return;
    setTxStatus("approving");
    try {
      const amount = BigInt(Math.floor(parseFloat(depositAmount) * 10 ** USDC_DECIMALS));
      writeContract({
        address: CONTRACTS.usdc as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.arcanaLend as `0x${string}`, amount],
      });
      setTxStatus("tx");
    } catch (e: any) {
      setErrorMsg(e.message);
      setTxStatus("error");
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Connect Wallet</h2>
          <ConnectButton />
        </div>
      </div>
    );
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
          <Link href="/pledge" className="text-sm text-white/50 hover:text-white">Pledge</Link>
          <ConnectButton showBalance={false} />
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">ARCANA Lending</h1>
          <p className="text-white/40">Borrow with your ZK credential — or earn yield as a lender</p>
        </div>

        {/* Protocol stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total Deposits", value: `$${formatUSDC(totalDeposits as bigint)}` },
            { label: "Total Borrowed", value: `$${formatUSDC(totalBorrowed as bigint)}` },
            { label: "Available", value: `$${totalDeposits && totalBorrowed ? formatUSDC((totalDeposits as bigint) - (totalBorrowed as bigint)) : "0.00"}` },
          ].map((s) => (
            <div key={s.label} className="glass rounded-2xl p-5 text-center">
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-white/40 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Credential Status */}
          <div className="glass rounded-2xl p-6 h-fit">
            <h2 className="font-semibold mb-4">Your Credential</h2>
            {tierNum > 0 ? (
              <div className={`rounded-xl p-4 border ${
                tierNum === 3 ? "border-yellow-500/40 bg-yellow-500/10" :
                tierNum === 2 ? "border-slate-400/40 bg-slate-400/10" :
                "border-amber-700/40 bg-amber-700/10"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    tierNum === 3 ? "bg-yellow-500 text-black" :
                    tierNum === 2 ? "bg-slate-400 text-black" :
                    "bg-amber-700 text-white"
                  }`}>
                    TIER {tierCfg.label}
                  </span>
                  <span className="text-xs text-white/40">Active ✓</span>
                </div>
                <div className="text-3xl font-bold text-white mt-2">{ratioNum}%</div>
                <div className="text-xs text-white/40">Collateral Required</div>
                <div className="mt-2 text-xs text-green-400">
                  You save {150 - ratioNum}% vs standard DeFi
                </div>
              </div>
            ) : (
              <div className="rounded-xl p-4 border border-white/10 bg-white/5 text-center">
                <div className="text-white/40 text-sm mb-3">No credential yet</div>
                <Link
                  href="/score"
                  className="px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-500 transition-colors"
                >
                  Get ZK Credential →
                </Link>
              </div>
            )}

            {/* Active position */}
            {position && (position as unknown as bigint[])[1] > 0n && (
              <div className="mt-4 p-4 bg-white/5 rounded-xl">
                <div className="text-xs text-white/40 mb-2">Active Position</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/50">Collateral</span>
                    <span>{formatUSDC((position as unknown as bigint[])[0])} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Borrowed</span>
                    <span>{formatUSDC((position as unknown as bigint[])[1])} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Health</span>
                    <span className={(position as unknown as (bigint | boolean)[])[5] ? "text-green-400" : "text-red-400"}>
                      {(position as unknown as (bigint | boolean)[])[5] ? "Healthy" : "At Risk!"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Borrow/Lend form */}
          <div className="space-y-4">
            <div className="flex rounded-xl overflow-hidden border border-white/10">
              <button
                onClick={() => setMode("borrow")}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  mode === "borrow" ? "bg-violet-600 text-white" : "bg-white/5 text-white/50"
                }`}
              >
                Borrow
              </button>
              <button
                onClick={() => setMode("lend")}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  mode === "lend" ? "bg-violet-600 text-white" : "bg-white/5 text-white/50"
                }`}
              >
                Lend
              </button>
            </div>

            <div className="glass rounded-2xl p-6">
              {mode === "borrow" ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-white/50 mb-2 block">Borrow Amount (USDC)</label>
                    <input
                      type="number"
                      value={borrowAmount}
                      onChange={(e) => setBorrowAmount(e.target.value)}
                      placeholder="100.00"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-white/50 mb-2 block">
                      Collateral (USDC) — min required: {requiredCollateral}
                    </label>
                    <input
                      type="number"
                      value={collateralAmount}
                      onChange={(e) => setCollateralAmount(e.target.value)}
                      placeholder={requiredCollateral}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3 text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-white/40">Your collateral ratio</span>
                      <span className="text-violet-300">{ratioNum}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">APR</span>
                      <span className="text-white">5%</span>
                    </div>
                  </div>
                  <button
                    onClick={handleBorrow}
                    disabled={txStatus === "approving" || txStatus === "tx"}
                    className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all"
                  >
                    {txStatus === "approving" ? "Approving USDC..." : txStatus === "tx" ? "Confirming..." : "Borrow USDC"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-white/50 mb-2 block">Deposit Amount (USDC)</label>
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="500.00"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-white/40">Estimated APY</span>
                      <span className="text-green-400">5%+</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">Utilization</span>
                      <span className="text-white">{totalDeposits && totalBorrowed ? Math.round((Number(totalBorrowed) / Number(totalDeposits)) * 100) : 57}%</span>
                    </div>
                  </div>
                  <button
                    onClick={handleDeposit}
                    disabled={txStatus === "approving" || txStatus === "tx"}
                    className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all"
                  >
                    {txStatus === "approving" ? "Approving..." : "Deposit & Earn"}
                  </button>
                </div>
              )}

              {txHash && (
                <div className="mt-4 text-center">
                  <a
                    href={`https://explorer.hsk.xyz/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-violet-400 hover:text-violet-300 font-mono"
                  >
                    View Tx: {txHash.slice(0, 16)}... ↗
                  </a>
                </div>
              )}

              {errorMsg && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                  {errorMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
