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
import multiprocessing as mp
from pathlib import Path

from fastapi.concurrency import run_in_threadpool

# Paths relative to the zkml directory
ZKML_DIR = Path(__file__).parent.parent.parent / "zkml"
CIRCUIT_PATH = ZKML_DIR / "network.ezkl"
PK_PATH = ZKML_DIR / "pk.key"
VK_PATH = ZKML_DIR / "vk.key"
SETTINGS_PATH = ZKML_DIR / "settings.json"
SRS_PATH = ZKML_DIR / "kzg.srs"

# Hard ceiling on a single proof attempt. EZKL's Halo2 prover is normally
# sub-second for this circuit, but certain input values have been observed to
# make the underlying Rust prover hang indefinitely — and with near-zero CPU
# usage while it hangs, which means it is likely holding the Python GIL the
# entire time (blocked on a native mutex/condvar/channel without releasing
# it back to Python). That makes a plain worker-thread offload useless: the
# GIL-holding hang freezes every other thread in the process too, including
# the asyncio event loop, so the whole server appears dead.
#
# The only reliable fix is to run each proof attempt in its own OS process
# (spawned fresh, not forked, to avoid inheriting the running event loop) so
# that on timeout we can forcibly kill -9 it and fully reclaim the server —
# a hang can now only ever affect the one request that triggered it.
# Kept short (well above the sub-second time a healthy proof actually takes)
# so a live demo degrades to demo mode quickly instead of stalling on stage.
EZKL_PROVE_TIMEOUT_SECONDS = 12


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

    The real EZKL work always runs in an isolated subprocess with a hard
    timeout. If it doesn't finish in time, the subprocess is killed and we
    fall back to a demo-mode proof — a single slow/stuck input can no longer
    freeze the server or leave the UI stuck forever.
    """
    if not is_ezkl_ready():
        return _generate_demo_proof(features)

    status, payload = await run_in_threadpool(
        _run_ezkl_in_subprocess, features, EZKL_PROVE_TIMEOUT_SECONDS
    )

    if status == "ok":
        return payload

    result = _generate_demo_proof(features)
    if status == "timeout":
        result["_note"] = (
            f"EZKL proof generation exceeded {EZKL_PROVE_TIMEOUT_SECONDS}s for this input; "
            "the worker was terminated and a demo-mode proof was served instead."
        )
    else:
        result["_note"] = f"EZKL proof generation failed ({payload}); served a demo-mode proof instead."
    return result


def _run_ezkl_in_subprocess(features: list[float], timeout: float) -> tuple[str, object]:
    """
    Run `_generate_ezkl_proof_sync` in a fresh child process and enforce a
    hard wall-clock timeout, killing the child if it's exceeded.

    Returns ("ok", result_dict), ("timeout", None), or ("error", message).
    Runs inside FastAPI's threadpool (blocking `process.join()` is fine there
    — it's plain stdlib code, so it correctly releases the GIL while waiting,
    unlike the EZKL call itself).
    """
    ctx = mp.get_context("spawn")
    result_queue: mp.Queue = ctx.Queue()
    process = ctx.Process(target=_ezkl_subprocess_entrypoint, args=(features, result_queue))
    process.start()
    process.join(timeout)

    if process.is_alive():
        process.terminate()
        process.join(2)
        if process.is_alive():
            process.kill()
            process.join()
        return ("timeout", None)

    if not result_queue.empty():
        return result_queue.get()
    return ("error", f"worker exited with code {process.exitcode} and no result")


def _ezkl_subprocess_entrypoint(features: list[float], result_queue: "mp.Queue") -> None:
    """Entrypoint for the child process — must be a module-level function to be picklable."""
    try:
        result = _generate_ezkl_proof_sync(features)
        result_queue.put(("ok", result))
    except Exception as e:  # noqa: BLE001 — surface any failure back to the parent
        result_queue.put(("error", str(e)))


def _generate_ezkl_proof_sync(features: list[float]) -> dict:
    """Generate a real EZKL ZK proof (EZKL 23.x — get_srs is async, rest are sync).

    Only ever called from inside the isolated subprocess spawned by
    `_run_ezkl_in_subprocess` — never call this directly from the server
    process, since a hang here can freeze the whole interpreter (GIL).
    """
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
