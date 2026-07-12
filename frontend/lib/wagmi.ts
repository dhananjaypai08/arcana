import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

// HashKey Chain Testnet (active network)
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

// Use injected connector only (MetaMask / any browser wallet — no WalletConnect)
export const wagmiConfig = createConfig({
  chains: [hashkeyTestnet, hashkeyChain],
  connectors: [injected()],
  transports: {
    [hashkeyTestnet.id]: http("https://testnet.hsk.xyz"),
    [hashkeyChain.id]: http("https://mainnet.hsk.xyz"),
  },
  // no ssr:true — all pages are client-side, avoids hydration mismatch
});

// HashKey Testnet deployed contract addresses (from deployments.json)
export const CONTRACTS = {
  usdc:        process.env.NEXT_PUBLIC_USDC_ADDRESS    || "0x054ed45810DbBAb8B27668922D110669c9D88D0a",
  verifier:    process.env.NEXT_PUBLIC_ARCANA_VERIFIER || "0x3BA5bDec11CF7780684B7588646c114a6120f15a",
  arcanaCred:  process.env.NEXT_PUBLIC_ARCANA_CRED     || "0xF3f8246758F2A97e1D9fA12477768952Ca188AB1",
  arcanaLend:  process.env.NEXT_PUBLIC_ARCANA_LEND     || "0xdFd2978db888C3eFe1e8f89bf97Ac4C34bDbDc90",
  arcanaPledge:process.env.NEXT_PUBLIC_ARCANA_PLEDGE   || "0xDdd21a9f856C50ED7851608d0727224164E0f9b2",
} as const;

export const PROOF_SERVER = process.env.NEXT_PUBLIC_PROOF_SERVER_URL || "http://localhost:8000";
export const EXPLORER = "https://testnet-explorer.hsk.xyz";
