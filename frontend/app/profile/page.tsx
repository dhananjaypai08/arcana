"use client";

import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { NavBar } from "@/components/NavBar";
import { ConnectWallet } from "@/components/ConnectWallet";
import { ButtonLink, Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { TierBadge, StatusBadge } from "@/components/ui/Badge";
import { ARCANA_CRED_ABI, ARCANA_LEND_ABI, ARCANA_PLEDGE_ABI } from "@/lib/abis";
import { CONTRACTS, EXPLORER } from "@/lib/wagmi";
import { useActivity } from "@/lib/useActivity";
import { clearActivity } from "@/lib/activity";
import { toast } from "@/lib/toast";
import { useMounted } from "@/lib/useMounted";

const USDC_DECIMALS = 6;
const formatUSDC = (v: bigint | undefined) =>
  v !== undefined ? (Number(v) / 10 ** USDC_DECIMALS).toFixed(2) : "0.00";

const STATUS_LABELS = ["open", "matched", "resolved", "expired"] as const;

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ProfilePage() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const activity = useActivity(address);

  const { data: tier } = useReadContract({
    address: CONTRACTS.arcanaCred as `0x${string}`,
    abi: ARCANA_CRED_ABI,
    functionName: "getTier",
    args: [address as `0x${string}`],
    query: { enabled: !!address && !!CONTRACTS.arcanaCred },
  });

  const { data: collateralRatio } = useReadContract({
    address: CONTRACTS.arcanaCred as `0x${string}`,
    abi: ARCANA_CRED_ABI,
    functionName: "getCollateralRatio",
    args: [address as `0x${string}`],
    query: { enabled: !!address && !!CONTRACTS.arcanaCred },
  });

  const { data: position } = useReadContract({
    address: CONTRACTS.arcanaLend as `0x${string}`,
    abi: ARCANA_LEND_ABI,
    functionName: "getPosition",
    args: [address as `0x${string}`],
    query: { enabled: !!address && !!CONTRACTS.arcanaLend },
  });

  const { data: totalPledges } = useReadContract({
    address: CONTRACTS.arcanaPledge as `0x${string}`,
    abi: ARCANA_PLEDGE_ABI,
    functionName: "totalPledges",
    query: { enabled: !!CONTRACTS.arcanaPledge },
  });

  const pledgeCount = totalPledges ? Number(totalPledges) : 0;

  const { data: pledgeResults } = useReadContracts({
    contracts: Array.from({ length: pledgeCount }, (_, i) => ({
      address: CONTRACTS.arcanaPledge as `0x${string}`,
      abi: ARCANA_PLEDGE_ABI,
      functionName: "getPledge",
      args: [BigInt(i)],
    })),
    query: { enabled: !!CONTRACTS.arcanaPledge && pledgeCount > 0 },
  });

  const myPledges = useMemo(() => {
    if (!pledgeResults || !address) return [];
    const lower = address.toLowerCase();
    return pledgeResults
      .map((r, i) => {
        if (r.status !== "success" || !r.result) return null;
        const p = r.result as readonly [string, string, number, number, bigint, bigint, number, boolean];
        return { id: i, pledgor: p[0], counterparty: p[1], currentTier: p[2], targetTier: p[3], deadline: Number(p[4]), premium: p[5], status: p[6] };
      })
      .filter((p): p is NonNullable<typeof p> => !!p)
      .filter((p) => p.pledgor.toLowerCase() === lower || p.counterparty.toLowerCase() === lower)
      .sort((a, b) => b.id - a.id);
  }, [pledgeResults, address]);

  const tierNum = typeof tier === "number" ? tier : (Number(tier) || 0);
  const ratioNum = typeof collateralRatio === "bigint" ? Number(collateralRatio) : 150;
  const pos = position as unknown as (bigint | boolean)[] | undefined;

  const pendingCount = activity.filter((a) => a.status === "pending").length;
  const confirmedCount = activity.filter((a) => a.status === "confirmed").length;

  if (!mounted || !isConnected) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4 text-primary">Connect Wallet</h2>
          <p className="text-secondary mb-6">Connect to view your profile and activity history</p>
          <ConnectWallet />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      <NavBar active="profile" />

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-primary">Your Profile</h1>
          <p className="text-secondary font-mono text-sm">{address}</p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard label="Credential Tier" value={tierNum > 0 ? `Tier ${["", "C", "B", "A"][tierNum]}` : "None"} />
          <StatCard label="Collateral Ratio" value={`${ratioNum}%`} />
          <StatCard label="Total Actions" value={String(activity.length)} />
          <StatCard label="Pending Txs" value={String(pendingCount)} />
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Credential card */}
          <Card>
            <h2 className="font-semibold mb-4 text-primary">ZK Credential</h2>
            {tierNum > 0 ? (
              <div className="flex items-center justify-between">
                <TierBadge tier={tierNum} />
                <span className="text-sm text-secondary">{ratioNum}% collateral required</span>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-secondary text-sm mb-3">No credential minted yet</p>
                <ButtonLink href="/score" size="sm">Generate ZK Proof →</ButtonLink>
              </div>
            )}
          </Card>

          {/* Lending position */}
          <Card>
            <h2 className="font-semibold mb-4 text-primary">Lending Position</h2>
            {pos && pos[1] && (pos[1] as bigint) > 0n ? (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-secondary">Collateral</span>
                  <span className="text-primary">{formatUSDC(pos[0] as bigint)} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Borrowed</span>
                  <span className="text-primary">{formatUSDC(pos[1] as bigint)} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Health</span>
                  <span className={pos[5] ? "text-emerald-400" : "text-red-400"}>{pos[5] ? "Healthy" : "At Risk"}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-secondary text-sm mb-3">No active borrow position</p>
                <ButtonLink href="/lend" size="sm">Go to Lending →</ButtonLink>
              </div>
            )}
          </Card>
        </div>

        {/* My pledges */}
        <Card className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary">My Pledges</h2>
            <ButtonLink href="/pledge" size="sm" variant="ghost">View Market →</ButtonLink>
          </div>
          {myPledges.length === 0 ? (
            <p className="text-secondary text-sm text-center py-4">You haven&apos;t created or taken any pledges yet</p>
          ) : (
            <div className="space-y-3">
              {myPledges.map((p) => {
                const isMine = address?.toLowerCase() === p.pledgor.toLowerCase();
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-white/[4%] rounded-xl flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <TierBadge tier={p.currentTier} size="sm" />
                      <span className="text-muted text-xs">→</span>
                      <TierBadge tier={p.targetTier} size="sm" />
                      <StatusBadge status={STATUS_LABELS[p.status]} />
                      <span className="text-xs text-muted">{isMine ? "Pledgor" : "Counterparty"}</span>
                    </div>
                    <span className="text-sm text-primary font-mono">{formatUSDC(p.premium)} USDC</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Activity log */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary">Activity History</h2>
            {activity.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (address) {
                    clearActivity(address);
                    toast.info("Activity history cleared");
                  }
                }}
              >
                Clear
              </Button>
            )}
          </div>
          {activity.length === 0 ? (
            <p className="text-secondary text-sm text-center py-6">
              No actions yet. Actions you take (minting credentials, borrowing, pledging) will show up here with live confirmation status.
            </p>
          ) : (
            <div className="divide-y divide-white/5">
              {activity.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-3 gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-primary font-medium">{item.type}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span>{timeAgo(item.timestamp)}</span>
                    {item.hash && (
                      <a
                        href={`${EXPLORER}/tx/${item.hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-violet-400 hover:text-violet-300 font-mono"
                      >
                        {item.hash.slice(0, 10)}... ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {activity.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5 flex justify-between text-xs text-muted">
              <span>{confirmedCount} confirmed</span>
              <span>{pendingCount} pending</span>
              <span>{activity.filter((a) => a.status === "failed").length} failed</span>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
