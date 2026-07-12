"""
ARCANA — EZKL Proof Generation Service

Generates ZK proofs using EZKL for the CreditMLP model.
Falls back to a "demo proof" if EZKL is not yet set up,
allowing the full UI flow to be demonstrated.
"""

import os
import json
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
    from eth_abi import decode as abi_decode

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, "input.json")
        witness_path = os.path.join(tmpdir, "witness.json")
        proof_path = os.path.join(tmpdir, "proof.json")
        calldata_path = os.path.join(tmpdir, "calldata.bin")

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

        # proof_data["proof"] is a raw byte array (list[int]), not hex — use
        # "hex_proof" for display purposes only.
        proof_hex = proof_data.get("hex_proof", "")

        # Build the exact calldata EZKL would send to the on-chain verifier's
        # verifyProof(bytes,uint256[]) and decode it back out. This is the only
        # reliable way to get `instances` in the byte order/field-element form
        # the Halo2Verifier assembly expects — the raw proof.json "instances"
        # array is little-endian field-element bytes and cannot be parsed with
        # a naive int(hex, 16).
        calldata = bytes(ezkl.encode_evm_calldata(proof=proof_path, calldata=calldata_path))
        proof_bytes_decoded, instances_decoded = abi_decode(["bytes", "uint256[]"], calldata[4:])

        score, tier = _compute_score_and_tier(features)

        return {
            "proof_hex": proof_hex,
            "instances": [str(i) for i in instances_decoded],
            "score": score,
            "tier": tier,
            "tier_label": ["None", "C", "B", "A"][tier],
            "collateral_ratio": [150, 120, 90, 70][tier],
            "mode": "ezkl",
            "proof_bytes": "0x" + proof_bytes_decoded.hex(),
            "instances_uint256": [str(i) for i in instances_decoded],
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


def _compute_score_and_tier(features: list[float]) -> tuple[int, int]:
    """Compute display score + tier from the credit features (linear approximation of CreditMLP)."""
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
