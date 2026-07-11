"""
ARCANA Protocol — Per-User Proof Generation
Used by the proof server to generate proofs for user inputs.

Usage:
    python3 generate_proof.py --input '{"input_data": [[0.72, 0.60, 0.55, 0.65, 0.85, 0.40]]}'
"""

import asyncio
import json
import os
import sys
import argparse
import tempfile
import base64

os.chdir(os.path.dirname(os.path.abspath(__file__)))

try:
    import ezkl
except ImportError:
    print(json.dumps({"error": "ezkl not installed"}))
    sys.exit(1)


async def generate_proof_for_input(input_data: list[list[float]]) -> dict:
    """
    Generate a ZK proof for the given input features.
    Returns proof bytes and public instances.
    """
    # Validate input shape
    if len(input_data) != 1 or len(input_data[0]) != 6:
        raise ValueError("Input must be shape [1, 6] — 6 credit features")

    for val in input_data[0]:
        if not (0.0 <= val <= 1.0):
            raise ValueError(f"All features must be normalized [0, 1], got {val}")

    # Write input to temp file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump({"input_data": input_data}, f)
        input_path = f.name

    witness_path = input_path.replace(".json", "_witness.json")
    proof_path = input_path.replace(".json", "_proof.json")

    try:
        # Generate witness
        res = await ezkl.gen_witness(
            data=input_path,
            model="network.ezkl",
            output=witness_path,
        )
        if not res:
            raise RuntimeError("Witness generation failed")

        # Generate proof
        res = await ezkl.prove(
            witness=witness_path,
            model="network.ezkl",
            pk_path="pk.key",
            proof_path=proof_path,
            proof_type="single",
            srs_path="kzg.srs",
        )
        if not res:
            raise RuntimeError("Proof generation failed")

        with open(proof_path) as f:
            proof_data = json.load(f)

        # Compute score from raw output
        instances = proof_data.get("instances", [[]])
        raw_score = instances[0][0] if instances and instances[0] else 0

        # EZKL outputs are field elements — normalize back to [0, 1]
        # For display, multiply by 1000
        score_raw = float(raw_score) / (2 ** 64)  # approximate
        score_display = min(int(score_raw * 1000), 1000)

        # Determine tier
        if score_display >= 850:
            tier = 3  # Tier A
        elif score_display >= 700:
            tier = 2  # Tier B
        elif score_display >= 500:
            tier = 1  # Tier C
        else:
            tier = 0  # None

        return {
            "proof": proof_data.get("proof", ""),
            "instances": instances,
            "score": score_display,
            "tier": tier,
            "tier_label": ["None", "C", "B", "A"][tier],
            "collateral_ratio": [150, 120, 90, 70][tier],
        }

    finally:
        for path in [input_path, witness_path, proof_path]:
            try:
                os.unlink(path)
            except Exception:
                pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=str, required=True, help="JSON input features")
    args = parser.parse_args()

    input_json = json.loads(args.input)
    result = asyncio.run(generate_proof_for_input(input_json["input_data"]))
    print(json.dumps(result))
