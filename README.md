# ARCANA Protocol

> **"Invisible inputs. Verifiable outputs. Tradeable facts."**

The first zkML oracle on HashKey Chain — proves AI model execution via zero-knowledge proofs, tokenizes results as soulbound credentials, and enables under-collateralized DeFi lending + a derivatives market on personal on-chain reputation.

## Architecture

```
User (browser)
  │ private signals
  ▼
Proof Server (FastAPI + EZKL)
  │ generate Halo2 ZK proof from CreditMLP ONNX model
  │ [HSP x402 gate: 0.01 USDC per proof]
  ▼
HashKey Chain Mainnet (ChainID 177)
  ├── Halo2Verifier.sol     ← EZKL auto-generated ZK verifier
  ├── ArcanaCred.sol        ← ERC-5192 soulbound NFT (tier credential)
  ├── ArcanaLend.sol        ← Under-collateralized USDC lending
  └── ArcanaPledge.sol      ← Score futures market
```

## Quick Deploy

### Prerequisites
- Node.js 20+
- Python 3.13+
- HSK tokens on HashKey Chain mainnet (for gas)

### 1. Install dependencies

```bash
# Contracts
cd contracts && npm install

# Python venv + zkML
python3.13 -m venv .venv
source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install onnx onnxscript ezkl

# Frontend
cd frontend && npm install
```

### 2. Train model + run EZKL setup (already done — artifacts in zkml/)

```bash
source .venv/bin/activate
python3 zkml/train_model.py   # generates model.onnx
python3 zkml/ezkl_setup.py    # generates ArcanaVerifier.sol, pk.key, vk.key
```

### 3. Configure and deploy contracts

```bash
cd contracts
cp .env.example .env
# Edit .env: add PRIVATE_KEY (wallet with HSK for gas)

# Deploy to HashKey Chain mainnet
npm run deploy:mainnet
```

### 4. Configure and start proof server

```bash
cd proof-server
cp .env.example .env
# Edit .env: add contract addresses from deployments.json

source ../.venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 5. Configure and run frontend

```bash
cd frontend
cp .env.local.example .env.local
# Edit .env.local: add contract addresses + proof server URL

npm run dev
```

## Contract Addresses (HashKey Chain Mainnet)

After deployment, addresses are saved to `contracts/deployments.json`.

| Contract | Address |
|----------|---------|
| Halo2Verifier | TBD |
| ArcanaCred | TBD |
| ArcanaLend | TBD |
| ArcanaPledge | TBD |

## How ZK Proofs Work

```python
# EZKL proof pipeline (per user request)
ezkl.gen_witness(input.json, network.ezkl, witness.json)
ezkl.prove(witness.json, network.ezkl, pk.key, proof.json)

# On-chain verification
Halo2Verifier.verifyProof(proof_bytes, instances)  # → bool
ArcanaCred.mintTier(proof_bytes, instances)         # → ERC-5192 soulbound NFT
```

## Credit Scoring Model

**CreditMLP** — 3-layer PyTorch MLP (~800 parameters)

Input features (normalized 0–1):
- `wallet_age_days` — how long the wallet has been active
- `tx_count_90d` — transaction count in last 90 days  
- `defi_protocols_used` — number of DeFi protocols interacted with
- `avg_hold_duration` — average token hold duration
- `liquidation_penalty` — inverted liquidation history
- `cross_chain_activity` — cross-chain bridge usage

Output: Score 0–1000 → Tier mapping:

| Score | Tier | Collateral Required |
|-------|------|---------------------|
| 850+ | A | 70% |
| 700–849 | B | 90% |
| 500–699 | C | 120% |
| < 500 | None | 150% (standard) |

## Tech Stack

- **zkML**: EZKL 23.x + PyTorch → ONNX → Halo2 circuit → Solidity verifier
- **Contracts**: Solidity 0.8.28, Hardhat, OpenZeppelin 5.x
- **Proof Server**: Python 3.13, FastAPI, EZKL
- **HSP**: x402 paywall on /proof/generate (0.01 USDC per ZK proof)
- **Frontend**: Next.js 16, TypeScript, Tailwind CSS, Wagmi v2, RainbowKit
- **Chain**: HashKey Chain Mainnet (ChainID 177)

## Why This Wins

1. **First zkML deployment on HashKey Chain** — real Halo2 proof verified on-chain
2. **Novel financial primitive** — derivatives market on ZK-proven personal attributes
3. **Genuinely solves the collateral problem** — without revealing private data
4. **HSP integration is native** — proof generation itself is the paid API
5. **Clear demo** — judges see a real ZK proof on HashKey Chain explorer in real time
