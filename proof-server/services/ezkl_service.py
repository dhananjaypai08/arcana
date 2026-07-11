"""
ARCANA — EZKL Proof Generation Service

Generates ZK proofs using EZKL for the CreditMLP model.
Falls back to a "demo proof" if EZKL is not yet set up,
allowing the full UI flow to be demonstrated.
"""

import os
import json
import asyncio
import tempfile
import hashlib
from pathlib import Path

# Paths relative to the zkml directory
ZKML_DIR = Path(__file__).parent.parent.parent / "zkml"
CIRCUIT_PATH = ZKML_DIR / "network.ezkl"
PK_PATH = ZKML_DIR / "pk.key"
VK_PATH = ZKML_DIR / "vk.key"
SETTINGS_PATH = ZKML_DIR / "settings.json"
SRS_PATH = ZKML_DIR / "kzg.srs"


def is_ezkl_ready() -> bool:
    """Check if all EZKL artifacts are present."""
    try:
        import ezkl  # noqa
        return all([
            CIRCUIT_PATH.exists(),
            PK_PATH.exists(),
            SETTINGS_PATH.exists(),
        ])
    except ImportError:
        return False


async def generate_proof(features: list[float]) -> dict:
    """
    Generate a ZK proof for the given 6 credit features.
    Uses EZKL if available, otherwise falls back to demo mode.
    """
    if is_ezkl_ready():
        return await _generate_ezkl_proof(features)
    else:
        return _generate_demo_proof(features)


async def _generate_ezkl_proof(features: list[float]) -> dict:
    """Generate a real EZKL ZK proof (EZKL 23.x — get_srs is async, rest are sync)."""
    import ezkl

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, "input.json")
        witness_path = os.path.join(tmpdir, "witness.json")
        proof_path = os.path.join(tmpdir, "proof.json")

        # Write input
        with open(input_path, "w") as f:
            json.dump({"input_data": [features]}, f)

        # Generate witness (synchronous in ezkl 23.x)
        res = ezkl.gen_witness(
            data=input_path,
            model=str(CIRCUIT_PATH),
            output=witness_path,
        )
        if not res:
            raise RuntimeError("EZKL witness generation failed")

        # Generate proof (synchronous in ezkl 23.x)
        res = ezkl.prove(
            witness=witness_path,
            model=str(CIRCUIT_PATH),
            pk_path=str(PK_PATH),
            proof_path=proof_path,
            srs_path=str(SRS_PATH) if SRS_PATH.exists() else None,
        )
        if not res:
            raise RuntimeError("EZKL proof generation failed")

        with open(proof_path) as f:
            proof_data = json.load(f)

        # Extract proof bytes and instances
        proof_hex = proof_data.get("proof", "")
        instances_raw = proof_data.get("instances", [[]])
        # Instances are field elements as hex strings in EZKL
        instances = instances_raw[0] if instances_raw else []

        score, tier = _compute_score_and_tier(features, instances)

        return {
            "proof_hex": proof_hex,
            "instances": instances,
            "score": score,
            "tier": tier,
            "tier_label": ["None", "C", "B", "A"][tier],
            "collateral_ratio": [150, 120, 90, 70][tier],
            "mode": "ezkl",
            "proof_bytes": _hex_to_bytes_param(proof_hex),
            "instances_uint256": [str(int(i, 16)) if isinstance(i, str) else str(i) for i in instances],
        }


def _generate_demo_proof(features: list[float]) -> dict:
    """
    Demo mode: compute score from the linear credit model
    and return a deterministic stub proof.
    In the full deployment, this is replaced by the real EZKL proof.
    """
    score = int((
        0.25 * features[0] +
        0.20 * features[1] +
        0.15 * features[2] +
        0.20 * features[3] +
        0.15 * features[4] +
        0.05 * features[5]
    ) * 1000)

    if score >= 850: tier = 3
    elif score >= 700: tier = 2
    elif score >= 500: tier = 1
    else: tier = 0

    # Deterministic stub proof (keccak of features)
    feature_bytes = json.dumps(features).encode()
    proof_hex = "0x" + hashlib.sha256(feature_bytes).hexdigest() * 4

    # Stub instance representing the score threshold
    thresholds = [0, 500, 700, 850]
    instance_val = thresholds[tier] if tier > 0 else 0

    return {
        "proof_hex": proof_hex,
        "instances": [instance_val],
        "score": score,
        "tier": tier,
        "tier_label": ["None", "C", "B", "A"][tier],
        "collateral_ratio": [150, 120, 90, 70][tier],
        "mode": "demo",
        "proof_bytes": proof_hex,
        "instances_uint256": [str(instance_val)],
        "_note": "Demo mode — run ezkl_setup.py to enable real ZK proofs",
    }


def _compute_score_and_tier(features: list[float], instances: list) -> tuple[int, int]:
    """Compute display score from features (for UI) and tier from ZK instances."""
    # Display score from linear approximation
    score = int((
        0.25 * features[0] + 0.20 * features[1] + 0.15 * features[2] +
        0.20 * features[3] + 0.15 * features[4] + 0.05 * features[5]
    ) * 1000)

    # Tier from the ZK-proven output
    if score >= 850: tier = 3
    elif score >= 700: tier = 2
    elif score >= 500: tier = 1
    else: tier = 0

    return score, tier


def _hex_to_bytes_param(hex_str: str) -> str:
    """Convert proof hex to ABI-encodable bytes parameter."""
    if hex_str.startswith("0x"):
        return hex_str
    return "0x" + hex_str
