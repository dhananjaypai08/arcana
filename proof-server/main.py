"""
ARCANA Protocol — Proof Generation Server
FastAPI server that generates EZKL ZK proofs for credit scoring,
gated behind HSP x402 payments.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os

from routes.proof import router as proof_router
from routes.score import router as score_router
from routes.health import router as health_router

app = FastAPI(
    title="ARCANA Proof Server",
    description="zkML-powered ZK proof generation for ARCANA credit credentials",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(score_router, prefix="/score", tags=["score"])
app.include_router(proof_router, prefix="/proof", tags=["proof"])


@app.get("/")
async def root():
    return {
        "name": "ARCANA Proof Server",
        "tagline": "Invisible inputs. Verifiable outputs. Tradeable facts.",
        "version": "1.0.0",
        "endpoints": {
            "score": "GET /score/{address} — fetch on-chain signals for address",
            "proof": "POST /proof/generate — generate ZK proof (HSP x402 gated)",
            "proof_demo": "POST /proof/demo — generate proof without HSP (demo mode)",
            "health": "GET /health — server health check",
        },
        "zkml": "EZKL v15+ — Halo2 circuit over CreditMLP",
        "chain": "HashKey Chain (ChainID 177)",
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
