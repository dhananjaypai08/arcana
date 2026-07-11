import { PROOF_SERVER } from "./wagmi";

export interface ScoreSignals {
  address: string;
  wallet_age_days: number;
  tx_count_90d: number;
  defi_protocols_used: number;
  avg_hold_duration: number;
  liquidation_penalty: number;
  cross_chain_activity: number;
  features: number[];
  estimated_score: number;
  estimated_tier: number;
  estimated_tier_label: string;
}

export interface ProofResult {
  success: boolean;
  proof?: string;
  instances?: unknown[];
  score?: number;
  tier?: number;
  tier_label?: string;
  collateral_ratio?: number;
  proof_mode?: string;
  generation_time_ms?: number;
  proof_bytes?: string;
  instances_uint256?: string[];
  error?: string;
}

export async function fetchScoreSignals(address: string): Promise<ScoreSignals> {
  const res = await fetch(`${PROOF_SERVER}/score/${address}`);
  if (!res.ok) throw new Error(`Failed to fetch score signals: ${res.statusText}`);
  return res.json();
}

export async function generateProof(
  features: number[],
  address: string,
  hspReceipt?: object
): Promise<ProofResult> {
  const endpoint = hspReceipt ? "/proof/generate" : "/proof/demo";
  const res = await fetch(`${PROOF_SERVER}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features, address, hsp_receipt: hspReceipt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.detail || err.error || "Proof generation failed");
  }
  return res.json();
}

export async function fetchProtocolStats() {
  try {
    const res = await fetch(`${PROOF_SERVER}/health`);
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

export const TIER_CONFIG = [
  { tier: 0, label: "Unverified", color: "gray", ratio: 150, minScore: 0, maxScore: 499 },
  { tier: 1, label: "Tier C", color: "amber", ratio: 120, minScore: 500, maxScore: 699 },
  { tier: 2, label: "Tier B", color: "slate", ratio: 90, minScore: 700, maxScore: 849 },
  { tier: 3, label: "Tier A", color: "yellow", ratio: 70, minScore: 850, maxScore: 1000 },
] as const;

export function getTierConfig(tier: number) {
  return TIER_CONFIG[tier] ?? TIER_CONFIG[0];
}
