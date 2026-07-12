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

// HashKey Testnet deployed contract addresses (from contracts/deployments.json)
export const CONTRACTS = {
  usdc:        process.env.NEXT_PUBLIC_USDC_ADDRESS    || "0x770E1C48309e0e42d9aaA409042e7c77Cb30c9c5",
  verifier:    process.env.NEXT_PUBLIC_ARCANA_VERIFIER || "0xd8611665C78345cFb47b3D3F16642C43e9E822Ed",
  arcanaCred:  process.env.NEXT_PUBLIC_ARCANA_CRED     || "0xB5935FbE9BB2C769661a7ACE9EC6992D6C5Ca2C2",
  arcanaLend:  process.env.NEXT_PUBLIC_ARCANA_LEND     || "0xB4B45E802Aedf148B87FeC835dFA3D2BA18a9982",
  arcanaPledge:process.env.NEXT_PUBLIC_ARCANA_PLEDGE   || "0xac984E1275ffEC692479C8b91aF63365435330F5",
} as const;

export const PROOF_SERVER = process.env.NEXT_PUBLIC_PROOF_SERVER_URL || "http://localhost:8000";
export const EXPLORER = "https://testnet-explorer.hsk.xyz";
