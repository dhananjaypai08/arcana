from fastapi import APIRouter
import os
import sys

router = APIRouter()


@router.get("")
async def health():
    ezkl_available = False
    torch_available = False
    try:
        import ezkl  # noqa
        ezkl_available = True
    except ImportError:
        pass
    try:
        import torch  # noqa
        torch_available = True
    except ImportError:
        pass

    circuit_ready = os.path.exists(
        os.path.join(os.path.dirname(__file__), "../../zkml/network.ezkl")
    )
    pk_ready = os.path.exists(
        os.path.join(os.path.dirname(__file__), "../../zkml/pk.key")
    )

    return {
        "status": "ok",
        "python": sys.version,
        "ezkl_installed": ezkl_available,
        "torch_installed": torch_available,
        "circuit_ready": circuit_ready,
        "pk_ready": pk_ready,
        "demo_mode": not (ezkl_available and circuit_ready and pk_ready),
        "rpc": os.getenv("HASHKEY_RPC", "https://mainnet.hsk.xyz"),
    }
