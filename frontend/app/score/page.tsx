"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { NavBar } from "@/components/NavBar";
import { ConnectWallet } from "@/components/ConnectWallet";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fetchScoreSignals, generateProof, type ScoreSignals, type ProofResult } from "@/lib/api";
import { ARCANA_CRED_ABI } from "@/lib/abis";
import { CONTRACTS, EXPLORER } from "@/lib/wagmi";
import { useTxFlow } from "@/lib/useTxFlow";
import { toast } from "@/lib/toast";

type Step = "idle" | "fetching" | "review" | "proving" | "minting" | "done" | "error";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function ScorePage() {
  const { address, isConnected } = useAccount();
  const [step, setStep] = useState<Step>("idle");
  const [signals, setSignals] = useState<ScoreSignals | null>(null);
  const [proof, setProof] = useState<ProofResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proofProgress, setProofProgress] = useState(0);

  const mintFlow = useTxFlow();

  useEffect(() => {
    if (isConnected && address && step === "idle") {
      startFlow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  async function startFlow() {
    if (!address) return;
    setStep("fetching");
    setError(null);
    try {
      const s = await fetchScoreSignals(address);
      setSignals(s);
      setStep("review");
    } catch (e) {
      setError(errorMessage(e));
      setStep("error");
    }
  }

  async function handleGenerateProof() {
    if (!signals || !address) return;
    setStep("proving");
    setProofProgress(0);

    const interval = setInterval(() => {
      setProofProgress((p) => Math.min(p + Math.random() * 15, 90));
    }, 300);

    try {
      const result = await generateProof(signals.features, address);
      clearInterval(interval);
      setProofProgress(100);
      setProof(result);

      if (result.success && result.tier && result.tier > 0 && CONTRACTS.arcanaCred) {
        await handleMintCredential(result);
      } else {
        setStep("done");
      }
    } catch (e) {
      clearInterval(interval);
      const msg = errorMessage(e);
      setError(msg);
      setStep("error");
      toast.error("Proof generation failed", msg);
    }
  }

  async function handleMintCredential(proofResult: ProofResult) {
    if (!proofResult.proof_bytes || !proofResult.instances_uint256) {
      setStep("done");
      return;
    }

    setStep("minting");
    const ok = await mintFlow.run([
      {
        label: "Mint ARCANA Credential",
        address: CONTRACTS.arcanaCred as `0x${string}`,
        abi: ARCANA_CRED_ABI,
        functionName: "mintTier",
        args: [proofResult.proof_bytes as `0x${string}`, proofResult.instances_uint256.map(BigInt)],
      },
    ]);

    if (ok) {
      toast.success("Credential minted!", `Tier ${proofResult.tier_label} soulbound NFT is now on-chain`);
    } else {
      toast.error("Credential minting failed", mintFlow.error || "The proof was generated but on-chain mint failed");
    }
    setStep("done");
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-6">🔮</div>
          <h2 className="text-2xl font-bold mb-4 text-primary">Connect Your Wallet</h2>
          <p className="text-secondary mb-8">Connect to fetch your on-chain credit signals</p>
          <ConnectWallet />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      <NavBar active="score" />

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-primary">ZK Credit Score</h1>
          <p className="text-secondary">
            Prove your creditworthiness without revealing your data
          </p>
        </div>

        {/* Step: Fetching */}
        {step === "fetching" && (
          <Card className="p-10 text-center">
            <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-secondary">Fetching on-chain signals for {address?.slice(0, 8)}...</p>
          </Card>
        )}

        {/* Step: Review signals */}
        {step === "review" && signals && (
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-semibold text-primary">Your On-Chain Signals</h2>
                <div className="px-3 py-1 rounded-full bg-white/5 text-xs text-muted font-mono">
                  {address?.slice(0, 8)}...{address?.slice(-6)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                {[
                  { label: "Wallet Age", value: `${signals.wallet_age_days} days`, icon: "📅" },
                  { label: "Transactions (90d)", value: signals.tx_count_90d.toString(), icon: "⚡" },
                  { label: "DeFi Protocols", value: signals.defi_protocols_used.toString(), icon: "🔗" },
                  { label: "Avg Hold Duration", value: `${signals.avg_hold_duration} days`, icon: "⏱" },
                  { label: "Liquidation Record", value: signals.liquidation_penalty > 0.7 ? "Clean ✓" : "Has issues", icon: "🛡" },
                  { label: "Cross-Chain", value: signals.cross_chain_activity > 0.3 ? "Active" : "Limited", icon: "🌐" },
                ].map((item) => (
                  <div key={item.label} className="bg-white/[4%] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{item.icon}</span>
                      <span className="text-xs text-muted">{item.label}</span>
                    </div>
                    <div className="font-semibold text-primary">{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Estimated score */}
              <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-violet-400 mb-1">Estimated Score (pre-ZK)</div>
                    <div className="text-3xl font-bold text-primary">{signals.estimated_score}</div>
                    <div className="text-sm text-violet-300 mt-1">→ Tier {signals.estimated_tier_label}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted mb-1">Collateral Ratio</div>
                    <div className="text-2xl font-bold text-primary">{[150, 120, 90, 70][signals.estimated_tier]}%</div>
                    <div className="text-xs text-muted mt-1">vs 150% standard</div>
                  </div>
                </div>
              </div>

              <div className="text-xs text-muted mb-4 p-3 bg-white/[3%] rounded-lg">
                🔒 Your raw signals are processed locally and sent only to the proof server for ZK generation.
                The model weights and your exact inputs are never revealed on-chain.
              </div>

              <button
                onClick={handleGenerateProof}
                className="w-full py-4 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-all glow-purple text-lg cursor-pointer"
              >
                Generate ZK Proof →
              </button>
            </Card>
          </div>
        )}

        {/* Step: Proving */}
        {step === "proving" && (
          <Card className="p-10">
            <h2 className="text-xl font-bold mb-6 text-center text-primary">Generating ZK Proof</h2>

            <div className="space-y-4 mb-8">
              {[
                { label: "Encoding private inputs", done: proofProgress > 15 },
                { label: "Running EZKL circuit witness generation", done: proofProgress > 45 },
                { label: "Computing Halo2 proof", done: proofProgress > 75 },
                { label: "Verifying proof locally", done: proofProgress >= 100 },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs border transition-all ${
                    item.done
                      ? "border-violet-500 bg-violet-500 text-white"
                      : "border-white/20 text-white/20"
                  }`}>
                    {item.done ? "✓" : "○"}
                  </div>
                  <span className={`text-sm transition-colors ${item.done ? "text-primary" : "text-muted"}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="w-full bg-white/10 rounded-full h-2 mb-3">
              <div
                className="h-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-300"
                style={{ width: `${proofProgress}%` }}
              />
            </div>
            <div className="text-center text-sm text-muted font-mono">{Math.round(proofProgress)}%</div>
          </Card>
        )}

        {/* Step: Minting credential */}
        {step === "minting" && proof && (
          <Card className="p-10 text-center">
            <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2 text-primary">Submitting to HashKey Chain</h2>
            <p className="text-secondary text-sm">
              {mintFlow.status === "pending" ? mintFlow.stepLabel : "Calling ArcanaCred.mintTier() with ZK proof..."}
            </p>
            {mintFlow.txHash && (
              <a
                href={`${EXPLORER}/tx/${mintFlow.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-xs text-violet-400 hover:text-violet-300 font-mono"
              >
                View on Explorer: {mintFlow.txHash.slice(0, 16)}... ↗
              </a>
            )}
          </Card>
        )}

        {/* Step: Done */}
        {step === "done" && proof && (
          <div className="space-y-4">
            {/* Credential card */}
            <div className={`rounded-2xl p-8 border-2 ${
              proof.tier === 3 ? "border-yellow-500/60 bg-gradient-to-b from-yellow-500/15 to-transparent" :
              proof.tier === 2 ? "border-slate-400/60 bg-gradient-to-b from-slate-400/15 to-transparent" :
              proof.tier === 1 ? "border-amber-700/60 bg-gradient-to-b from-amber-700/15 to-transparent" :
              "border-white/20 bg-white/5"
            }`}>
              <div className="flex items-start justify-between mb-6 flex-wrap gap-2">
                <div>
                  <div className="text-xs font-mono text-violet-400 mb-1">ARCANA CREDENTIAL</div>
                  <h2 className="text-2xl font-bold text-primary">
                    {proof.tier && proof.tier > 0 ? `Tier ${proof.tier_label} Verified` : "Score Below Threshold"}
                  </h2>
                  <p className="text-secondary text-sm mt-1">
                    {proof.proof_mode === "ezkl" ? "Zero-knowledge proof verified on HashKey Chain" : "Demo mode proof generated"}
                  </p>
                  {mintFlow.status === "error" && (
                    <p className="text-red-400 text-xs mt-2">⚠ On-chain mint failed: {mintFlow.error}</p>
                  )}
                </div>
                <div className={`px-4 py-2 rounded-xl text-sm font-bold ${
                  proof.tier === 3 ? "bg-yellow-500 text-black" :
                  proof.tier === 2 ? "bg-slate-400 text-black" :
                  proof.tier === 1 ? "bg-amber-700 text-white" :
                  "bg-white/20 text-white"
                }`}>
                  TIER {proof.tier_label || "–"}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{proof.score}</div>
                  <div className="text-xs text-muted mt-1">ZK Score</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{proof.collateral_ratio}%</div>
                  <div className="text-xs text-muted mt-1">Collateral Ratio</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{proof.generation_time_ms}ms</div>
                  <div className="text-xs text-muted mt-1">Proof Time</div>
                </div>
              </div>

              {/* Proof details */}
              <div className="bg-black/40 rounded-xl p-4 font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted">Proof Mode</span>
                  <span className="text-violet-300">{proof.proof_mode?.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Proof Hash</span>
                  <span className="text-secondary">{proof.proof?.slice(0, 20)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Public Instance</span>
                  <span className="text-secondary">{proof.instances_uint256?.[0]?.slice(0, 12)}...</span>
                </div>
                {mintFlow.txHash && (
                  <div className="flex justify-between">
                    <span className="text-muted">Tx Hash</span>
                    <a href={`${EXPLORER}/tx/${mintFlow.txHash}`} target="_blank" rel="noreferrer" className="text-violet-300 hover:text-violet-200">
                      {mintFlow.txHash.slice(0, 12)}... ↗
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-4">
              <ButtonLink href="/lend" variant="secondary" className="py-4">Use in Lending →</ButtonLink>
              <ButtonLink href="/pledge" variant="secondary" className="py-4 bg-violet-600/20 border border-violet-500/30 text-violet-300 hover:bg-violet-600/30">
                Create Pledge →
              </ButtonLink>
            </div>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <Card className="border border-red-500/20">
            <div className="text-red-400 mb-4">⚠ Error</div>
            <p className="text-secondary text-sm mb-4 font-mono">{error}</p>
            <button
              onClick={() => { setStep("idle"); startFlow(); }}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 text-primary rounded-xl transition-all text-sm cursor-pointer"
            >
              Try Again
            </button>
          </Card>
        )}
      </main>
    </div>
  );
}
