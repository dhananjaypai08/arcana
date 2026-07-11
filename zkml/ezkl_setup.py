"""
ARCANA Protocol — EZKL Circuit Setup
Compiles the credit scoring MLP into a ZK circuit and generates a Solidity verifier.

Run AFTER train_model.py:
    python3 ezkl_setup.py

Artifacts produced:
    settings.json       — circuit settings
    network.ezkl        — compiled circuit
    pk.key              — proving key (large, not committed to git)
    vk.key              — verification key
    kzg.srs             — structured reference string
    ArcanaVerifier.sol  — Solidity verifier (copy to contracts/)
"""

import json
import os
import sys
import asyncio

os.chdir(os.path.dirname(os.path.abspath(__file__)))

try:
    import ezkl
    print(f"EZKL version: {ezkl.__version__}")
except ImportError:
    print("❌ ezkl not installed. Run: pip install ezkl")
    sys.exit(1)


async def setup_ezkl():
    print("🔧 Step 1: Generating circuit settings...")
    res = ezkl.gen_settings(
        model="model.onnx",
        output="settings.json",
    )
    assert res, "gen_settings failed"
    print("   ✅ settings.json generated")

    print("\n🔧 Step 2: Calibrating settings for resource usage...")
    res = ezkl.calibrate_settings(
        data="input.json",
        model="model.onnx",
        settings="settings.json",
        target="resources",
    )
    assert res, "calibrate_settings failed"
    print("   ✅ Settings calibrated")

    print("\n🔧 Step 3: Compiling circuit...")
    res = ezkl.compile_circuit(
        model="model.onnx",
        compiled_circuit="network.ezkl",
        settings_path="settings.json",
    )
    assert res, "compile_circuit failed"
    print("   ✅ network.ezkl compiled")

    print("\n🔧 Step 4: Downloading SRS (Structured Reference String)...")
    # get_srs returns a Future in EZKL 23.x — must be awaited
    res = await ezkl.get_srs(
        settings_path="settings.json",
        srs_path="kzg.srs",
    )
    assert res, "get_srs failed"
    print("   ✅ kzg.srs downloaded")

    print("\n🔧 Step 5: Running trusted setup (generating pk + vk)...")
    res = ezkl.setup(
        model="network.ezkl",
        vk_path="vk.key",
        pk_path="pk.key",
        srs_path="kzg.srs",
    )
    assert res, "setup failed"
    print("   ✅ pk.key and vk.key generated")

    print("\n🔧 Step 6: Creating EVM Solidity verifier...")
    res = ezkl.create_evm_verifier(
        vk_path="vk.key",
        settings_path="settings.json",
        sol_code_path="ArcanaVerifier.sol",
        abi_path="ArcanaVerifier.abi.json",
        srs_path="kzg.srs",
    )
    assert res, "create_evm_verifier failed"
    print("   ✅ ArcanaVerifier.sol generated")

    print("\n🔧 Step 7: Generating proof for sample input (sanity check)...")
    res = ezkl.gen_witness(
        data="input.json",
        model="network.ezkl",
        output="witness.json",
    )
    assert res, "gen_witness failed"

    res = ezkl.prove(
        witness="witness.json",
        model="network.ezkl",
        pk_path="pk.key",
        proof_path="proof.json",
        srs_path="kzg.srs",
    )
    assert res, "prove failed"

    with open("proof.json") as f:
        proof_data = json.load(f)
    print(f"   ✅ Sample proof generated")
    print(f"   Proof instances (public outputs): {proof_data.get('instances', [])}")

    print("\n🎉 EZKL setup complete!")
    print("   → ArcanaVerifier.sol is ready to deploy on HashKey Chain")
    print("   → Copy it to contracts/contracts/ and redeploy")
    print("   → The proof server uses: network.ezkl, pk.key")


async def verify_sample():
    """Verify the sample proof to confirm everything works end-to-end."""
    print("\n🔍 Verifying sample proof...")
    res = ezkl.verify(
        proof_path="proof.json",
        settings_path="settings.json",
        vk_path="vk.key",
        srs_path="kzg.srs",
    )
    if res:
        print("   ✅ Proof VERIFIED — ZK circuit is working correctly!")
    else:
        print("   ❌ Proof verification FAILED")
    return res


if __name__ == "__main__":
    asyncio.run(setup_ezkl())
    asyncio.run(verify_sample())
