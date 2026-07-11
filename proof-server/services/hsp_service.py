"""
ARCANA — HSP Payment Verification Service

Verifies HSP payment receipts for the x402 paywall on /proof/generate.
The proof generation endpoint costs 0.01 USDC per ZK proof.
"""

import os
import httpx
import json
from typing import Optional

HSP_COORDINATOR_URL = os.getenv("HSP_COORDINATOR_URL", "")
HSP_API_KEY = os.getenv("HSP_API_KEY", "")
HSP_ADAPTER_ADDRESS = os.getenv("HSP_ADAPTER_ADDRESS", "")
MIN_AMOUNT = 10_000  # 0.01 USDC (6 decimals)
HSP_ENABLED = os.getenv("HSP_ENABLED", "true").lower() == "true"


async def verify_hsp_payment(receipt: dict) -> bool:
    """
    Verify that a valid HSP payment receipt covers at least 0.01 USDC.

    The receipt should contain:
      - mandate: the signed payment mandate
      - receipt: the adapter-signed receipt
      - attestations: optional KYC/sanctions attestations
    """
    if not HSP_ENABLED:
        return True  # HSP disabled → always accept (dev mode)

    if not HSP_COORDINATOR_URL:
        # No coordinator configured → demo mode, accept all
        return True

    mandate = receipt.get("mandate")
    receipt_obj = receipt.get("receipt")
    payment_id = receipt.get("paymentId")

    if not payment_id:
        return False

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{HSP_COORDINATOR_URL}/payments/{payment_id}",
                headers={"Authorization": f"Bearer {HSP_API_KEY}"},
            )
            if resp.status_code != 200:
                return False

            data = resp.json()
            status = data.get("status")
            last_decision = data.get("lastDecision", {})

            if status != "SETTLED":
                return False

            if not last_decision.get("ok"):
                return False

            # Verify amount
            mandate_body = data.get("mandate", {}).get("body", {})
            amount = int(mandate_body.get("amount", 0))
            if amount < MIN_AMOUNT:
                return False

            return True

    except Exception as e:
        print(f"HSP verification error: {e}")
        # In demo mode, accept if coordinator unreachable
        return os.getenv("HSP_DEMO_FALLBACK", "true").lower() == "true"


async def get_payment_status(payment_id: str) -> dict:
    """Fetch full payment status from HSP coordinator."""
    if not HSP_COORDINATOR_URL:
        return {"status": "UNKNOWN", "demo": True}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{HSP_COORDINATOR_URL}/payments/{payment_id}",
                headers={"Authorization": f"Bearer {HSP_API_KEY}"},
            )
            return resp.json()
    except Exception as e:
        return {"status": "ERROR", "error": str(e)}
