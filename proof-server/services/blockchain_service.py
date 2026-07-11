"""
ARCANA — Blockchain Service
Reads on-chain state from HashKey Chain for contract queries.
"""

import os
import json
from pathlib import Path
from typing import Optional

HASHKEY_RPC = os.getenv("HASHKEY_RPC", "https://mainnet.hsk.xyz")
DEPLOYMENTS_PATH = Path(__file__).parent.parent.parent / "contracts" / "deployments.json"

# Minimal ABI fragments
ARCANA_CRED_ABI = [
    {"inputs": [{"name": "user", "type": "address"}], "name": "getTier", "outputs": [{"type": "uint8"}], "stateMutability": "view", "type": "function"},
    {"inputs": [{"name": "user", "type": "address"}], "name": "getCollateralRatio", "outputs": [{"type": "uint256"}], "stateMutability": "view", "type": "function"},
    {"inputs": [{"name": "user", "type": "address"}], "name": "isCredentialValid", "outputs": [{"type": "bool"}], "stateMutability": "view", "type": "function"},
]

ARCANA_LEND_ABI = [
    {"inputs": [], "name": "totalDeposits", "outputs": [{"type": "uint256"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "totalBorrowed", "outputs": [{"type": "uint256"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "utilizationRate", "outputs": [{"type": "uint256"}], "stateMutability": "view", "type": "function"},
    {"inputs": [{"name": "user", "type": "address"}], "name": "getPosition", "outputs": [{"type": "uint256"}, {"type": "uint256"}, {"type": "uint256"}, {"type": "uint8"}, {"type": "uint256"}, {"type": "bool"}], "stateMutability": "view", "type": "function"},
    {"inputs": [{"name": "lender", "type": "address"}], "name": "getLenderValue", "outputs": [{"type": "uint256"}], "stateMutability": "view", "type": "function"},
]

ARCANA_PLEDGE_ABI = [
    {"inputs": [], "name": "totalPledges", "outputs": [{"type": "uint256"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "getOpenPledges", "outputs": [{"type": "uint256[]"}], "stateMutability": "view", "type": "function"},
    {"inputs": [{"name": "pledgeId", "type": "uint256"}], "name": "getPledge", "outputs": [{"components": [{"name": "pledgor", "type": "address"}, {"name": "counterparty", "type": "address"}, {"name": "currentTier", "type": "uint8"}, {"name": "targetTier", "type": "uint8"}, {"name": "deadline", "type": "uint64"}, {"name": "premium", "type": "uint256"}, {"name": "status", "type": "uint8"}, {"name": "pledgorWon", "type": "bool"}], "type": "tuple"}], "stateMutability": "view", "type": "function"},
]


def get_deployments() -> dict:
    if DEPLOYMENTS_PATH.exists():
        with open(DEPLOYMENTS_PATH) as f:
            return json.load(f)
    return {}


def get_w3():
    try:
        from web3 import Web3
        w3 = Web3(Web3.HTTPProvider(HASHKEY_RPC))
        return w3 if w3.is_connected() else None
    except ImportError:
        return None


def get_contract(w3, address: str, abi: list):
    from web3 import Web3
    return w3.eth.contract(
        address=Web3.to_checksum_address(address),
        abi=abi,
    )


async def get_protocol_stats() -> dict:
    """Return protocol-level statistics."""
    deps = get_deployments()
    w3 = get_w3()

    if not w3 or not deps:
        return _demo_stats()

    try:
        lend = get_contract(w3, deps.get("arcanaLend", ""), ARCANA_LEND_ABI)
        total_deposits = lend.functions.totalDeposits().call()
        total_borrowed = lend.functions.totalBorrowed().call()
        utilization = lend.functions.utilizationRate().call()

        pledge = get_contract(w3, deps.get("arcanaPledge", ""), ARCANA_PLEDGE_ABI)
        total_pledges = pledge.functions.totalPledges().call()

        return {
            "total_deposits_usdc": total_deposits / 1e6,
            "total_borrowed_usdc": total_borrowed / 1e6,
            "utilization_rate": utilization,
            "total_pledges": total_pledges,
            "contracts": deps,
        }
    except Exception:
        return _demo_stats()


def _demo_stats() -> dict:
    return {
        "total_deposits_usdc": 12500.0,
        "total_borrowed_usdc": 7200.0,
        "utilization_rate": 57,
        "total_pledges": 14,
        "contracts": get_deployments(),
        "_demo": True,
    }
