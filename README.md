# ARCANA Protocol

> **"Invisible inputs. Verifiable outputs. Tradeable facts."**

The first zkML oracle on HashKey Chain — proves AI model execution via zero-knowledge proofs, mints the result as a soulbound credential, and unlocks under-collateralized DeFi lending + a derivatives market on personal on-chain reputation.

**Deployed on:** HashKey Chain Testnet (ChainID 133)

---

## Contract Addresses (HashKey Testnet)

| Contract | Address |
|----------|---------|
| Halo2Verifier (EZKL) | `0x3BA5bDec11CF7780684B7588646c114a6120f15a` |
| ArcanaCred (ERC-5192) | `0xF3f8246758F2A97e1D9fA12477768952Ca188AB1` |
| ArcanaLend | `0xdFd2978db888C3eFe1e8f89bf97Ac4C34bDbDc90` |
| ArcanaPledge | `0xDdd21a9f856C50ED7851608d0727224164E0f9b2` |
| USDC | `0x054ed45810DbBAb8B27668922D110669c9D88D0a` |

Explorer: https://testnet-explorer.hsk.xyz

---

## How It Works

```
Browser wallet (MetaMask)
  │ private on-chain signals
  ▼
Proof Server (FastAPI + EZKL)
  │ CreditMLP ONNX → Halo2 circuit → ZK proof (~1.5s)
  │ [HSP x402: 0.01 USDC per proof]
  ▼
HashKey Chain Testnet
  ├── Halo2Verifier   ← EZKL auto-generated, verifies proof on-chain
  ├── ArcanaCred      ← ERC-5192 soulbound NFT minted on valid proof
  ├── ArcanaLend      ← Borrow USDC at reduced collateral based on tier
  └── ArcanaPledge    ← Bet on your own future ZK-proven score improvement
```

### Credit Tiers

| Score | Tier | Collateral Required |
|-------|------|---------------------|
| 850+  | A    | **70%** |
| 700–849 | B  | **90%** |
| 500–699 | C  | **120%** |
| < 500 | —   | 150% (standard) |

---

## Running Locally

### Prerequisites
- Node.js 20+
- Python 3.13 (not 3.14 — has a broken `pyexpat` on macOS)

### 1. Frontend

```bash
cd frontend
cp .env.example .env.local   # contract addresses already filled in
npm install
npm run dev                   # http://localhost:3000
```

### 2. Proof Server

```bash
# Use the project venv (Python 3.13 with ezkl + torch already installed)
source .venv/bin/activate
pip install -r proof-server/requirements.txt   # only 5 packages

cd proof-server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The server starts in **demo mode** automatically — no extra setup needed. Real EZKL ZK proofs work via the `.venv` which already has `ezkl` installed.

### 3. Connect wallet

Open http://localhost:3000, click **Connect Wallet** (MetaMask / any injected wallet), switch to HashKey Testnet when prompted.

---

## Deploying

### Contracts (already deployed — only needed if redeploying)

```bash
cd contracts
# edit .env with your private key + RPC
npx hardhat run scripts/deploy.ts --network hashkeyTestnet
```

### Frontend → Vercel

```bash
cd frontend
vercel --prod
```

### Proof Server → Railway

```bash
cd proof-server
railway login
railway init
railway up
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| ZK ML | EZKL 23.x · PyTorch MLP → ONNX → Halo2 circuit |
| Contracts | Solidity 0.8.28 · Hardhat · OpenZeppelin 5 · EVM Cancun |
| Proof Server | Python 3.13 · FastAPI · EZKL (optional) |
| Frontend | Next.js 16 · Wagmi v2 · injected wallet · Tailwind |
| Chain | HashKey Chain Testnet (ChainID 133) |

---

## Project Structure

```
HashKeyHackathon/
├── zkml/                  # ML model + ZK circuit artifacts
│   ├── train_model.py     # PyTorch MLP training
│   ├── ezkl_setup.py      # EZKL: gen_settings → compile → setup → verifier
│   ├── model.onnx         # Exported model (opset 11)
│   ├── network.ezkl       # Compiled circuit
│   ├── pk.key / vk.key    # Proving / verification keys
│   └── ArcanaVerifier.sol # EZKL auto-generated Halo2 Solidity verifier
├── contracts/             # Hardhat project
│   ├── contracts/
│   │   ├── ArcanaVerifier.sol   # Halo2 ZK verifier (from EZKL)
│   │   ├── ArcanaCred.sol       # ERC-5192 soulbound credential NFT
│   │   ├── ArcanaLend.sol       # Under-collateralized USDC lending
│   │   └── ArcanaPledge.sol     # Score futures market
│   ├── scripts/deploy.ts
│   └── deployments.json   # Live testnet addresses
├── proof-server/          # FastAPI proof generation server
│   ├── main.py
│   ├── routes/proof.py    # POST /proof/demo and /proof/generate
│   ├── routes/score.py    # GET /score/{address}
│   └── requirements.txt   # Only 5 packages needed
├── hsp-service/           # Node.js HSP x402 payment gateway
└── frontend/              # Next.js 16 app
    ├── app/page.tsx        # Landing page
    ├── app/score/page.tsx  # ZK proof generation + credential view
    ├── app/lend/page.tsx   # Borrow with credential-adjusted collateral
    ├── app/pledge/page.tsx # Score futures marketplace
    ├── components/ConnectWallet.tsx  # Direct injected wallet (no WalletConnect)
    └── .env.example        # Testnet addresses pre-filled
```

---

*ARCANA Protocol · HashKey Chain Horizon Hackathon 2026 · "Truth is the new collateral."*
