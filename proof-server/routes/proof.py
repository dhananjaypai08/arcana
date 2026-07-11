"""
ARCANA Proof Server — ZK Proof Generation Route

POST /proof/generate  — HSP x402 gated (0.01 USDC per proof)
POST /proof/demo      — No payment required (for judge demo)
"""

from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel, field_validator
from typing import Optional
import os
import json
import time
import asyncio

from services.ezkl_service import generate_proof, is_ezkl_ready
from services.hsp_service import verify_hsp_payment

router = APIRouter()


class ProofRequest(BaseModel):
    features: list[float]
    address: str
    hsp_receipt: Optional[dict] = None  # HSP payment receipt

    @field_validator("features")
    @classmethod
    def validate_features(cls, v):
        if len(v) != 6:
            raise ValueError("features must be exactly 6 values")
        for val in v:
            if not (0.0 <= val <= 1.0):
                raise ValueError(f"All features must be in [0, 1], got {val}")
        return v


class ProofResponse(BaseModel):
    success: bool
    proof: Optional[str] = None           # hex-encoded proof bytes
    instances: Optional[list] = None      # public outputs from ZK circuit
    score: Optional[int] = None           # display score (0-1000)
    tier: Optional[int] = None            # 0-3
    tier_label: Optional[str] = None      # None/C/B/A
    collateral_ratio: Optional[int] = None
    proof_mode: str = "ezkl"              # "ezkl" or "demo"
    generation_time_ms: Optional[int] = None
    error: Optional[str] = None
    # For on-chain submission
    proof_bytes: Optional[str] = None     # ABI-encoded for Solidity
    instances_uint256: Optional[list[str]] = None  # uint256[] for Solidity


@router.post("/generate", response_model=ProofResponse)
async def generate_proof_endpoint(req: ProofRequest):
    """
    Generate a ZK proof for the given credit features.
    Requires a valid HSP payment receipt (0.01 USDC).
    """
    # Verify HSP payment
    hsp_enabled = os.getenv("HSP_ENABLED", "true").lower() == "true"
    if hsp_enabled:
        if not req.hsp_receipt:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "Payment Required",
                    "message": "This endpoint requires a 0.01 USDC HSP payment.",
                    "amount": 10000,  # 0.01 USDC in base units (6 decimals)
                    "token": "USDC",
                    "chain": "hashkey",
                },
            )
        valid = await verify_hsp_payment(req.hsp_receipt)
        if not valid:
            raise HTTPException(status_code=402, detail="HSP payment invalid or insufficient")

    return await _do_generate(req.features, req.address, "ezkl")


@router.post("/demo", response_model=ProofResponse)
async def generate_proof_demo(req: ProofRequest):
    """
    Generate a ZK proof without payment (demo mode for judges/testing).
    Uses the same EZKL pipeline as /generate but skips HSP gate.
    """
    return await _do_generate(req.features, req.address, "demo")


async def _do_generate(features: list[float], address: str, mode: str) -> ProofResponse:
    """Core proof generation logic."""
    t0 = time.monotonic()

    try:
        result = await generate_proof(features)
        elapsed = int((time.monotonic() - t0) * 1000)

        return ProofResponse(
            success=True,
            proof=result.get("proof_hex"),
            instances=result.get("instances"),
            score=result.get("score"),
            tier=result.get("tier"),
            tier_label=result.get("tier_label"),
            collateral_ratio=result.get("collateral_ratio"),
            proof_mode=result.get("mode", mode),
            generation_time_ms=elapsed,
            proof_bytes=result.get("proof_bytes"),
            instances_uint256=result.get("instances_uint256"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Proof generation failed: {str(e)}")


@router.get("/status")
async def proof_status():
    """Check if EZKL is ready for proof generation."""
    ready = is_ezkl_ready()
    return {
        "ezkl_ready": ready,
        "mode": "ezkl" if ready else "demo",
        "circuit_path": os.path.join(os.path.dirname(__file__), "../../zkml/network.ezkl"),
        "pk_path": os.path.join(os.path.dirname(__file__), "../../zkml/pk.key"),
    }
