import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";

// HashKey Chain Mainnet
export const hashkeyChain = defineChain({
  id: 177,
  name: "HashKey Chain",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.hsk.xyz"] },
    public: { http: ["https://mainnet.hsk.xyz"] },
  },
  blockExplorers: {
    default: { name: "HashKey Explorer", url: "https://explorer.hsk.xyz" },
  },
  testnet: false,
});

// HashKey Chain Testnet
export const hashkeyTestnet = defineChain({
  id: 133,
  name: "HashKey Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet.hsk.xyz"] },
    public: { http: ["https://testnet.hsk.xyz"] },
  },
  blockExplorers: {
    default: { name: "HashKey Testnet Explorer", url: "https://testnet-explorer.hsk.xyz" },
  },
  testnet: true,
});

export const wagmiConfig = getDefaultConfig({
  appName: "ARCANA Protocol",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "arcana-demo",
  chains: [hashkeyChain, hashkeyTestnet],
  ssr: true,
});

// Contract addresses
export const CONTRACTS = {
  usdc: process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x054ed45810DbBAb8B27668922D110669c9D88D0a",
  verifier: process.env.NEXT_PUBLIC_ARCANA_VERIFIER || "",
  arcanaCred: process.env.NEXT_PUBLIC_ARCANA_CRED || "",
  arcanaLend: process.env.NEXT_PUBLIC_ARCANA_LEND || "",
  arcanaPledge: process.env.NEXT_PUBLIC_ARCANA_PLEDGE || "",
} as const;

export const PROOF_SERVER = process.env.NEXT_PUBLIC_PROOF_SERVER_URL || "http://localhost:8000";
export const HSP_SERVICE = process.env.NEXT_PUBLIC_HSP_SERVICE_URL || "http://localhost:3001";
