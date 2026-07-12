<p align="center">
  <img src="frontend/public/logo.png" alt="ARCANA Protocol" width="120" />
</p>

<h1 align="center">ARCANA Protocol</h1>

<p align="center">
  <b>"Invisible inputs. Verifiable outputs. Tradeable facts."</b>
</p>

The first zkML oracle on HashKey Chain. Prove your creditworthiness with a zero-knowledge proof instead of your raw data, mint it as a soulbound credential, and use it to unlock under-collateralized lending and trade a derivatives market on personal on-chain reputation.

**Deployed on:** HashKey Chain Testnet (ChainID 133)

---

## Table of Contents

- [Contract Addresses](#contract-addresses-hashkey-testnet)
- [The Idea](#the-idea)
- [End-to-End Flow](#end-to-end-flow)
  1. [Wallet connection](#1-wallet-connection)
  2. [On-chain signal ingestion](#2-on-chain-signal-ingestion)
  3. [zkML proof generation](#3-zkml-proof-generation-the-core)
  4. [HSP x402 paywall](#4-hsp-x402-paywall)
  5. [On-chain verification + credential minting](#5-on-chain-verification--credential-minting)
  6. [Under-collateralized lending](#6-under-collateralized-lending)
  7. [The Pledge Market (score futures)](#7-the-pledge-market-score-futures)
  8. [Activity tracking & UX](#8-activity-tracking--ux)
- [Credit Tiers](#credit-tiers)
- [Running Locally](#running-locally)
- [Deploying](#deploying)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)

---

## Contract Addresses (HashKey Testnet)

| Contract | Address |
|----------|---------|
| Halo2Verifier (EZKL) | `0xd8611665C78345cFb47b3D3F16642C43e9E822Ed` |
| ArcanaCred (ERC-5192) | `0xB5935FbE9BB2C769661a7ACE9EC6992D6C5Ca2C2` |
| ArcanaLend | `0xB4B45E802Aedf148B87FeC835dFA3D2BA18a9982` |
| ArcanaPledge | `0xac984E1275ffEC692479C8b91aF63365435330F5` |
| USDC (MockERC20) | `0x770E1C48309e0e42d9aaA409042e7c77Cb30c9c5` |

Explorer: https://testnet-explorer.hsk.xyz

---

## The Idea

Every DeFi lending protocol requires the same thing: massive overcollateralization (150%+), because there's no way to prove creditworthiness without doxxing your entire wallet history — or trusting a centralized score.

ARCANA fixes this with **zkML** (zero-knowledge machine learning): a small credit-scoring neural network runs over your private on-chain signals, and instead of revealing those signals (or the model's weights), you get a **cryptographic proof** that the model produced a specific score. That proof — not your data — is what goes on-chain.

The result is a **soulbound credential NFT** encoding your proven tier, which:
- Unlocks **under-collateralized borrowing** (down to 70% collateral vs. the standard 150%)
- Can be **wagered on** in a first-of-its-kind derivatives market — the **Pledge Market** — where you (or someone else) bets real money on whether you'll improve your score by a future deadline, settled trustlessly by a second ZK proof.

---

## End-to-End Flow

```
┌─────────────┐     ┌───────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│   Browser    │────▶│   Proof Server     │────▶│  HashKey Chain        │────▶│  Frontend UI        │
│  (Next.js)   │     │  (FastAPI + EZKL)  │     │  Testnet (contracts)  │     │  (activity/toasts)  │
└─────────────┘     └───────────────────┘     └──────────────────────┘     └─────────────────────┘
```

### 1. Wallet connection

`frontend/components/ConnectWallet.tsx` connects directly to any EIP-6963/injected wallet (MetaMask, Coinbase Wallet, etc. — no WalletConnect dependency) via `wagmi`. It handles:
- Multiple installed wallet extensions (shows a picker if more than one is detected)
- Auto-prompting to add/switch to HashKey Chain Testnet (`wallet_addEthereumChain`)
- SSR-safe hydration (all wallet state is gated behind a client-mount check)

### 2. On-chain signal ingestion

Visiting `/score` triggers `GET {PROOF_SERVER}/score/{address}` (`proof-server/routes/score.py`). This reads six raw behavioral signals for the connected wallet directly from the HashKey Chain RPC (tx count, wallet age proxy, balance-derived cross-chain activity, etc.), normalizes each into `[0, 1]`, and also computes a **non-ZK estimate** of the score/tier so the user can preview the result before spending anything on a real proof. If the RPC is unreachable, it falls back to deterministic demo signals derived from the address so the UI always has something to show.

```
features = [wallet_age, tx_count_90d, defi_protocols_used, avg_hold_duration, liquidation_penalty, cross_chain_activity]
```

### 3. zkML proof generation (the core)

This is the interesting part. The credit model (`zkml/train_model.py`) is a tiny PyTorch MLP (`CreditMLP`) trained to map the 6 normalized features to a credit score. It's exported to ONNX (opset 11, for EZKL compatibility) and compiled into a **Halo2 arithmetic circuit** by [EZKL](https://ezkl.xyz) (`zkml/ezkl_setup.py`):

```
CreditMLP.pt → model.onnx → ezkl.gen_settings → ezkl.compile_circuit → ezkl.setup
                                                                          │
                                                          ┌───────────────┴───────────────┐
                                                          ▼                               ▼
                                                pk.key / vk.key                 ArcanaVerifier.sol
                                              (proving/verify keys)        (auto-generated Halo2 verifier)
```

At request time, `proof-server/services/ezkl_service.py` runs the actual proof pipeline:

1. `ezkl.gen_witness(...)` — evaluates the circuit on the user's private features to produce a witness (the full trace of the computation, kept off-chain).
2. `ezkl.prove(...)` — generates a Halo2 SNARK proof that the witness is a valid execution of the committed circuit, using the pre-generated proving key (`pk.key`).
3. `ezkl.encode_evm_calldata(...)` — this is the crucial step: it builds the **exact calldata** that would be sent to the on-chain verifier's `verifyProof(bytes,uint256[])`. EZKL's raw `proof.json` "instances" field is little-endian field-element bytes that cannot be parsed with a naive hex→int conversion — `encode_evm_calldata` is the only reliable source of correctly-encoded values. The proof server then ABI-decodes that calldata (`eth_abi.decode(["bytes", "uint256[]"], calldata[4:])`) to recover the exact `proof` bytes and `instances` array to hand back to the frontend for the on-chain transaction.

If EZKL/the compiled circuit isn't available in the current environment, the server transparently falls back to a **demo mode** that computes the same linear approximation of the score and returns a deterministic stub proof — so the full UI flow always works, even without the heavy ML toolchain installed.

```
POST /proof/demo      { features, address }  →  { proof, instances, score, tier, proof_bytes, instances_uint256 }
POST /proof/generate  { ..., hsp_receipt }   →  same, but gated behind an HSP payment (see below)
```

### 4. HSP x402 paywall

`/proof/generate` (the "real" endpoint judges/production users would hit) is metered: it requires a **0.01 USDC HSP payment receipt** before generating a proof, returning HTTP `402 Payment Required` with a structured mandate otherwise. `proof-server/services/hsp_service.py` verifies the receipt against the HSP coordinator (settlement status, payment amount, decision outcome), and `hsp-service/index.ts` is a small Node.js gateway that can prepare/verify payments independently of the Python server. Both fall back to a permissive **demo mode** when no HSP coordinator is configured, so the flow is fully testable without live payment infra.

### 5. On-chain verification + credential minting

The frontend takes the `proof_bytes` + `instances_uint256` from the proof server and calls:

```solidity
ArcanaCred.mintTier(bytes proof, uint256[] instances)
```

`ArcanaCred.sol` calls `verifier.verifyProof(proof, instances)` against the **EZKL-generated Halo2 Solidity verifier** (`ArcanaVerifier.sol` — hundreds of lines of raw EVM assembly implementing pairing checks over the KZG-committed circuit). If the proof is valid, the contract maps `instances[0]` (the proven score) to a tier via `tierCThreshold`/`tierBThreshold`/`tierAThreshold`, and mints a **ERC-5192 soulbound NFT** — non-transferable, 90-day validity, one per address (re-minting burns the old one). This is what `frontend/app/score/page.tsx` walks the user through, with a live multi-step progress UI (`useTxFlow` hook) and toast notifications on submit/confirm/fail.

### 6. Under-collateralized lending

`ArcanaLend.sol` is a simple pooled USDC money market where the **required collateral ratio is looked up from your credential**, not a flat rate:

| Credential | Collateral Ratio |
|---|---|
| None | 150% (standard DeFi) |
| Tier C | 120% |
| Tier B | 90% |
| Tier A | 70% |

`borrow(amount, collateral)` checks `collateral * 100 >= amount * ratio` using `ArcanaCred.getCollateralRatio(msg.sender)`, then transfers out the loan. Lenders deposit into a shared pool and earn a share of interest (`depositLiquidity`/`withdrawLiquidity`, tracked via proportional shares). Positions accrue interest continuously and can be liquidated once collateral falls below `requiredRatio × 110%` (`liquidate`). The frontend (`app/lend/page.tsx`) runs both the USDC `approve` and the actual `borrow`/`depositLiquidity` call as a single sequential transaction flow via `useTxFlow`, so nothing gets stuck waiting on a step that never happened.

### 7. The Pledge Market (score futures)

The novel piece: `ArcanaPledge.sol` lets a user **wager on their own future improvement**.

```
Pledgor:      "I will go from Tier B → Tier A within 30 days. I stake 10 USDC."
Counterparty: takes the other side, stakes 10 USDC.
Deadline:     pledgor submits a NEW zk proof of their score.
Resolution:   if provenTier >= targetTier → pledgor wins both stakes (minus 2% protocol fee).
              else                         → counterparty wins.
```

This is fully trustless — `resolvePledge` re-runs the exact same `verifier.verifyProof` check used for credential minting, so there's no arbitrator, no oracle, no dispute window. If the pledgor never resolves in time, `claimExpired` lets the counterparty claim by default. The frontend (`app/pledge/page.tsx`) reads *all* pledges directly from the chain via a batched `useReadContracts` call (`getPledge(i)` for every `i < totalPledges()`), so the market view is always live on-chain state, not a static mock list.

### 8. Activity tracking & UX

Every write transaction anywhere in the app (`useTxFlow` hook, `frontend/lib/useTxFlow.ts`) runs as an explicit sequential step list — e.g. `[Approve USDC, Create Pledge]` — waiting for each to be mined via `publicClient.waitForTransactionReceipt` before moving on, so the UI never gets stuck on a stale "pending" state. Each step:
- Fires a toast (`lib/toast.ts` + `<Toaster/>`) on submit → confirm/fail, with a link to the explorer.
- Is recorded to a per-address activity log in `localStorage` (`lib/activity.ts`), visible via the bell icon in the nav (`ActivityPanel`) and the full `/profile` page — so at any point you can see exactly what you did (proofs generated, credentials minted, borrows, deposits, pledges created/taken/resolved) and its live confirmation status.

---

## Credit Tiers

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
pip install -r proof-server/requirements.txt   # only 5 required packages

cd proof-server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Check `GET /health` — it reports whether `ezkl`/`torch` are installed and whether the compiled circuit (`network.ezkl`, `pk.key`) is present. If any are missing, the server automatically serves **demo-mode proofs** instead so the full UI flow still works end-to-end.

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
| Proof Server | Python 3.13 · FastAPI · EZKL + eth_abi (optional) |
| Payments | HSP x402 (Node.js gateway + Python verifier) |
| Frontend | Next.js 16 · Wagmi v2 · injected wallet · Tailwind v4 |
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
│   ├── services/ezkl_service.py  # gen_witness → prove → encode_evm_calldata
│   ├── services/hsp_service.py   # HSP x402 receipt verification
│   └── requirements.txt   # 5 required packages + optional web3/ezkl/torch
├── hsp-service/           # Node.js HSP x402 payment gateway
└── frontend/              # Next.js 16 app
    ├── app/
    │   ├── page.tsx          # Landing page
    │   ├── score/page.tsx    # ZK proof generation + credential minting
    │   ├── lend/page.tsx     # Borrow with credential-adjusted collateral
    │   ├── pledge/page.tsx   # Score futures marketplace (live on-chain data)
    │   ├── profile/page.tsx  # Credential + position + pledges + activity log
    │   ├── icon.png / apple-icon.png / favicon.ico   # ARCANA branding
    ├── components/
    │   ├── NavBar.tsx          # Shared nav (logo, links, activity bell, wallet)
    │   ├── ConnectWallet.tsx   # Direct injected/EIP-6963 wallet connect
    │   ├── ActivityPanel.tsx   # Live tx activity dropdown
    │   └── ui/                # Button, Card, Badge design system primitives
    ├── lib/
    │   ├── useTxFlow.ts        # Sequential approve→action tx runner
    │   ├── activity.ts         # Per-address tx history (localStorage)
    │   └── toast.ts            # Toast notification pub/sub
    ├── public/logo.png         # ARCANA brand mark
    └── .env.example            # Testnet addresses pre-filled
```

---

*ARCANA Protocol · HashKey Chain Horizon Hackathon 2026 · "Truth is the new collateral."*
