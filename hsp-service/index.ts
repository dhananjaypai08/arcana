/**
 * ARCANA Protocol — HSP x402 Payment Gateway
 *
 * This Node.js service acts as the HSP payment verifier for the
 * proof generation paywall. The Python FastAPI proof server calls
 * this service to verify HSP receipts before generating ZK proofs.
 *
 * Architecture:
 *   Frontend → [HSP x402 payment] → HSP Coordinator
 *   Frontend → [payment receipt] → Proof Server
 *   Proof Server → [verify receipt] → THIS SERVICE → HSP Coordinator
 *   Proof Server → [if valid] → EZKL proof generation → Frontend
 */

import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import * as https from "https";
import * as http from "http";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.HSP_SERVICE_PORT || 3001;
const HSP_COORDINATOR_URL = process.env.HSP_COORDINATOR_URL || "";
const HSP_API_KEY = process.env.HSP_API_KEY || "";
const MIN_AMOUNT = 10_000; // 0.01 USDC

// ── Payment Verification ──────────────────────────────────────────────────────

interface HSPPaymentStatus {
  status: "SETTLED" | "PROPOSED" | "ATTEMPTED" | "FAILED" | "EXPIRED" | string;
  lastDecision?: { ok: boolean; outcomeClass: string; errorCode?: string };
  mandate?: { body: { amount: string | number; token: string; chainId: string } };
}

async function verifyPayment(paymentId: string): Promise<{
  valid: boolean;
  reason: string;
  data?: HSPPaymentStatus;
}> {
  if (!HSP_COORDINATOR_URL) {
    // Demo mode — no coordinator configured
    return { valid: true, reason: "demo_mode" };
  }

  try {
    const data = await fetchJSON(
      `${HSP_COORDINATOR_URL}/payments/${paymentId}`,
      { Authorization: `Bearer ${HSP_API_KEY}` }
    );

    if (data.status !== "SETTLED") {
      return { valid: false, reason: `not_settled:${data.status}`, data };
    }

    if (!data.lastDecision?.ok) {
      return {
        valid: false,
        reason: `rejected:${data.lastDecision?.outcomeClass}:${data.lastDecision?.errorCode}`,
        data,
      };
    }

    const amount = Number(data.mandate?.body?.amount || 0);
    if (amount < MIN_AMOUNT) {
      return { valid: false, reason: `insufficient_amount:${amount}<${MIN_AMOUNT}`, data };
    }

    return { valid: true, reason: "ok", data };
  } catch (err: any) {
    console.error("HSP verification error:", err.message);
    // Fallback: accept in demo mode
    if (process.env.HSP_DEMO_FALLBACK === "true") {
      return { valid: true, reason: "demo_fallback" };
    }
    return { valid: false, reason: `network_error:${err.message}` };
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    hsp_configured: !!HSP_COORDINATOR_URL,
    demo_mode: !HSP_COORDINATOR_URL,
  });
});

/**
 * POST /verify
 * Body: { paymentId: string }
 * Returns: { valid: boolean, reason: string }
 */
app.post("/verify", async (req, res) => {
  const { paymentId } = req.body;
  if (!paymentId) {
    return res.status(400).json({ valid: false, reason: "missing_payment_id" });
  }
  const result = await verifyPayment(paymentId);
  res.json(result);
});

/**
 * GET /payment/:id
 * Proxy to HSP coordinator for payment status.
 */
app.get("/payment/:id", async (req, res) => {
  const { id } = req.params;
  if (!HSP_COORDINATOR_URL) {
    return res.json({ status: "DEMO", demo: true });
  }
  try {
    const data = await fetchJSON(
      `${HSP_COORDINATOR_URL}/payments/${id}`,
      { Authorization: `Bearer ${HSP_API_KEY}` }
    );
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /prepare
 * Prepare an HSP payment (builds the mandate for frontend signing).
 * Frontend uses this to initiate the x402 flow.
 */
app.post("/prepare", async (req, res) => {
  const { to, amount, chain } = req.body;
  if (!HSP_COORDINATOR_URL) {
    // Demo mode — return mock payment preparation
    return res.json({
      demo: true,
      paymentId: "0x" + "d".repeat(64),
      mandate: { body: { amount, to, chain: chain || "hashkey" } },
      message: "Demo mode: HSP coordinator not configured",
    });
  }

  try {
    const data = await postJSON(`${HSP_COORDINATOR_URL}/payments`, {
      chain: chain || "hashkey",
      mandate: {
        body: {
          amount: amount || MIN_AMOUNT,
          recipient: { kind: 0, payload: to },
          // Additional fields would be filled by the HSP SDK on the client
        },
      },
    }, { Authorization: `Bearer ${HSP_API_KEY}` });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function fetchJSON(url: string, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { headers }, (resp) => {
      let data = "";
      resp.on("data", (chunk) => (data += chunk));
      resp.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Invalid JSON from ${url}`)); }
      });
    });
    req.on("error", reject);
  });
}

function postJSON(url: string, body: any, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
    };
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(options, (resp) => {
      let data = "";
      resp.on("data", (chunk) => (data += chunk));
      resp.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Invalid JSON")); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`ARCANA HSP Service running on port ${PORT}`);
  console.log(`HSP Coordinator: ${HSP_COORDINATOR_URL || "not configured (demo mode)"}`);
});
