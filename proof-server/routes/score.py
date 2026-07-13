"""
ARCANA Proof Server — On-Chain Signal Fetcher
Reads public on-chain data for a wallet address and computes normalized
credit features for the ZK model.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import time

router = APIRouter()

# Lazy import web3 so server starts even without it
def get_w3():
    try:
        from web3 import Web3  # type: ignore
        rpc = os.getenv("HASHKEY_RPC", "https://testnet.hsk.xyz")
        w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 5}))
        return w3 if w3.is_connected() else None
    except Exception:
        return None


class ScoreSignals(BaseModel):
    address: str
    wallet_age_days: float
    tx_count_90d: float
    defi_protocols_used: float
    avg_hold_duration: float
    liquidation_penalty: float
    cross_chain_activity: float
    # normalized versions (0-1)
    features: list[float]
    # estimated score from linear model (before ZK)
    estimated_score: int
    estimated_tier: int
    estimated_tier_label: str


@router.get("/{address}", response_model=ScoreSignals)
async def get_score_signals(address: str):
    """
    Fetch and compute credit signals for an Ethereum address.
    These signals are shown to the user; they then submit them
    privately to /proof/generate for ZK proof generation.
    """
    if not address.startswith("0x") or len(address) != 42:
        raise HTTPException(status_code=400, detail="Invalid Ethereum address")

    try:
        signals = await _fetch_signals(address.lower())
        return signals
    except Exception as e:
        # Return demo data if RPC unavailable
        return _demo_signals(address)


async def _fetch_signals(address: str) -> ScoreSignals:
    """Fetch real on-chain data. Raises if the RPC is unavailable or the
    on-chain reads fail, so the caller can fall back to demo signals instead
    of silently returning an all-zero result that looks like real data."""
    w3 = get_w3()

    if not (w3 and w3.is_connected()):
        raise RuntimeError("RPC unavailable — cannot fetch real on-chain signals")

    # Wallet age: estimate from first tx (simplified)
    tx_count = w3.eth.get_transaction_count(w3.to_checksum_address(address))

    # Normalize tx count (0 = 0 tx, 1 = 500+ tx)
    tx_count_90d = min(tx_count / 500.0, 1.0)

    # Wallet age proxy: assume ~7500 blocks/day on HashKey Chain
    # Check if address has any history at all
    balance = w3.eth.get_balance(w3.to_checksum_address(address))

    # Use tx count as proxy for age (more tx = older wallet)
    wallet_age_days = min(tx_count / 200.0, 1.0)  # rough proxy

    # Simulate protocol diversity from tx count
    defi_protocols_used = min(tx_count / 100.0, 1.0) * 0.7

    # Cross-chain activity (check if balance on ETH mainnet - simplified)
    cross_chain_activity = 0.3 if balance > 0 else 0.1

    # For demo purposes, use tx_count to estimate all features
    avg_hold_duration = (wallet_age_days + tx_count_90d) / 2
    liquidation_penalty = max(0.5, 1.0 - (tx_count_90d * 0.3))

    features = [
        round(wallet_age_days, 4),
        round(tx_count_90d, 4),
        round(defi_protocols_used, 4),
        round(avg_hold_duration, 4),
        round(liquidation_penalty, 4),
        round(cross_chain_activity, 4),
    ]

    # Estimate score (linear model, before ZK)
    raw_score = (
        0.25 * features[0] +
        0.20 * features[1] +
        0.15 * features[2] +
        0.20 * features[3] +
        0.15 * features[4] +
        0.05 * features[5]
    )
    estimated_score = int(raw_score * 1000)

    if estimated_score >= 850:
        tier, label = 3, "A"
    elif estimated_score >= 700:
        tier, label = 2, "B"
    elif estimated_score >= 500:
        tier, label = 1, "C"
    else:
        tier, label = 0, "None"

    return ScoreSignals(
        address=address,
        wallet_age_days=round(wallet_age_days * 365, 1),
        tx_count_90d=int(tx_count_90d * 500),
        defi_protocols_used=int(defi_protocols_used * 20),
        avg_hold_duration=round(avg_hold_duration * 365, 1),
        liquidation_penalty=round(liquidation_penalty, 4),
        cross_chain_activity=round(cross_chain_activity, 4),
        features=features,
        estimated_score=estimated_score,
        estimated_tier=tier,
        estimated_tier_label=label,
    )


def _demo_signals(address: str) -> ScoreSignals:
    """Return plausible demo signals when RPC is unavailable."""
    # Seed variation from address
    seed = int(address[2:10], 16) % 1000

    wallet_age = min((seed / 1000) * 0.9 + 0.1, 1.0)
    tx_count = min((seed % 500) / 500, 1.0)
    protocols = min((seed % 15) / 20, 1.0)
    hold_dur = (wallet_age + tx_count) / 2
    liq_pen = max(0.6, 1.0 - tx_count * 0.2)
    cross_chain = min(seed % 100 / 200, 0.8)

    features = [
        round(wallet_age, 4),
        round(tx_count, 4),
        round(protocols, 4),
        round(hold_dur, 4),
        round(liq_pen, 4),
        round(cross_chain, 4),
    ]

    raw = (0.25*features[0] + 0.20*features[1] + 0.15*features[2] +
           0.20*features[3] + 0.15*features[4] + 0.05*features[5])
    score = int(raw * 1000)

    if score >= 850: tier, label = 3, "A"
    elif score >= 700: tier, label = 2, "B"
    elif score >= 500: tier, label = 1, "C"
    else: tier, label = 0, "None"

    return ScoreSignals(
        address=address,
        wallet_age_days=round(wallet_age * 365, 1),
        tx_count_90d=int(tx_count * 500),
        defi_protocols_used=int(protocols * 20),
        avg_hold_duration=round(hold_dur * 365, 1),
        liquidation_penalty=round(liq_pen, 4),
        cross_chain_activity=round(cross_chain, 4),
        features=features,
        estimated_score=score,
        estimated_tier=tier,
        estimated_tier_label=label,
    )
