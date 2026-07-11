"""
ARCANA Protocol — Credit Scoring MLP
Trains a tiny 3-layer MLP on synthetic DeFi on-chain behavior signals.
Exported to ONNX for EZKL circuit compilation.
"""

import torch
import torch.nn as nn
import numpy as np
import json
import os

# ── Model Definition ──────────────────────────────────────────────────────────

class CreditMLP(nn.Module):
    """
    Input: 6 normalized features
      [wallet_age, tx_count_90d, defi_protocols, avg_hold_duration,
       liquidation_penalty, cross_chain_activity]
    Output: 1 score in [0, 1] (multiply by 1000 for display)
    """
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(6, 16),
            nn.ReLU(),
            nn.Linear(16, 8),
            nn.ReLU(),
            nn.Linear(8, 1),
            nn.Sigmoid(),
        )

    def forward(self, x):
        return self.net(x)


# ── Synthetic Training Data ────────────────────────────────────────────────────

def generate_synthetic_data(n=2000):
    """
    Generate synthetic (features, score) pairs with realistic correlations.
    Score tiers: <0.5 = None, 0.5-0.7 = C, 0.7-0.85 = B, 0.85+ = A
    """
    np.random.seed(42)

    wallet_age        = np.random.beta(2, 1.5, n)          # older = better
    tx_count_90d      = np.random.beta(1.5, 2, n)          # more = better
    defi_protocols    = np.random.beta(1.5, 3, n)          # more = better
    avg_hold_duration = np.random.beta(2, 2, n)            # longer = better
    liquidation_pen   = 1 - np.random.beta(1, 5, n)       # fewer liquidations = better
    cross_chain       = np.random.beta(1, 3, n)            # more = better

    # Score = weighted sum with noise
    score = (
        0.25 * wallet_age +
        0.20 * tx_count_90d +
        0.15 * defi_protocols +
        0.20 * avg_hold_duration +
        0.15 * liquidation_pen +
        0.05 * cross_chain +
        np.random.normal(0, 0.03, n)
    ).clip(0, 1)

    X = np.stack([
        wallet_age, tx_count_90d, defi_protocols,
        avg_hold_duration, liquidation_pen, cross_chain
    ], axis=1).astype(np.float32)
    y = score.reshape(-1, 1).astype(np.float32)

    return X, y


# ── Training ──────────────────────────────────────────────────────────────────

def train():
    model = CreditMLP()
    X, y = generate_synthetic_data()

    X_t = torch.FloatTensor(X)
    y_t = torch.FloatTensor(y)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.MSELoss()

    model.train()
    for epoch in range(500):
        optimizer.zero_grad()
        pred = model(X_t)
        loss = criterion(pred, y_t)
        loss.backward()
        optimizer.step()
        if (epoch + 1) % 100 == 0:
            print(f"Epoch {epoch+1}/500 — Loss: {loss.item():.5f}")

    model.eval()
    with torch.no_grad():
        sample_scores = model(X_t[:5]).numpy() * 1000
        print(f"\nSample scores (×1000): {sample_scores.flatten().tolist()}")

    torch.save(model.state_dict(), "model.pt")
    print("\n✅ Model saved to model.pt")
    return model


# ── ONNX Export ───────────────────────────────────────────────────────────────

def export_onnx(model):
    import torch as _torch
    model.eval()
    dummy = _torch.zeros(1, 6)
    # Use legacy export path (no dynamo) for EZKL compatibility (opset <= 11)
    with _torch.no_grad():
        _torch.onnx.export(
            model,
            (dummy,),
            "model.onnx",
            input_names=["features"],
            output_names=["score"],
            opset_version=11,       # EZKL tract supports up to opset 11
            dynamo=False,
            do_constant_folding=True,
        )
    print("✅ ONNX model exported to model.onnx (opset 11)")


# ── Sample Input for EZKL ─────────────────────────────────────────────────────

def save_sample_input():
    """Save a sample input JSON for EZKL calibration."""
    # A user with good DeFi history (should score ~Tier B)
    sample = {
        "input_data": [[
            0.72,   # wallet_age (2+ years)
            0.60,   # tx_count_90d (active)
            0.55,   # defi_protocols (5+ protocols)
            0.65,   # avg_hold_duration (holding)
            0.85,   # liquidation_penalty (clean record)
            0.40,   # cross_chain_activity (some)
        ]]
    }
    with open("input.json", "w") as f:
        json.dump(sample, f, indent=2)
    print("✅ Sample input saved to input.json")


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print("🧠 Training ARCANA Credit Scoring MLP...")
    model = train()
    export_onnx(model)
    save_sample_input()
    print("\n🎉 zkML model ready. Run ezkl_setup.py next.")
