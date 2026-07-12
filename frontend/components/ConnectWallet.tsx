"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { hashkeyTestnet } from "@/lib/wagmi";

const HASHKEY_TESTNET = {
  chainId: "0x85",           // 133 in hex
  chainName: "HashKey Chain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: ["https://testnet.hsk.xyz"],
  blockExplorerUrls: ["https://testnet-explorer.hsk.xyz"],
};

export function ConnectWallet({ showBalance = false }: { showBalance?: boolean }) {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const [hasWallet, setHasWallet] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setHasWallet(typeof window !== "undefined" && !!window.ethereum);
  }, []);

  // Avoid SSR mismatch — render nothing until client-side
  if (!mounted) {
    return (
      <div className="px-4 py-2 bg-white/[6%] border border-white/10 text-white/30 text-sm rounded-xl w-32 h-9" />
    );
  }

  // No wallet installed at all
  if (!hasWallet) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className="px-4 py-2 bg-violet-600/50 border border-violet-500/40 text-violet-300 text-sm font-semibold rounded-xl"
      >
        Install MetaMask
      </a>
    );
  }

  // Not connected
  if (!isConnected) {
    const handleConnect = async () => {
      try {
        // Direct ethereum call — most compatible across Arc, Brave, Chrome
        const accounts = await (window.ethereum as any).request({
          method: "eth_requestAccounts",
        });

        if (accounts?.length) {
          // Try wagmi connector after accounts are exposed
          const injectedConnector = connectors.find((c) => c.id === "injected") ?? connectors[0];
          if (injectedConnector) {
            connect({ connector: injectedConnector });
          }
        }
      } catch (err) {
        console.error("Wallet connect error:", err);
      }
    };

    return (
      <button
        onClick={handleConnect}
        disabled={isPending}
        className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer"
      >
        {isPending ? "Connecting..." : "Connect Wallet"}
      </button>
    );
  }

  // Connected but wrong chain
  if (chainId !== hashkeyTestnet.id) {
    const handleSwitch = async () => {
      try {
        // Try adding the chain first (in case it's not in wallet)
        await (window.ethereum as any).request({
          method: "wallet_addEthereumChain",
          params: [HASHKEY_TESTNET],
        });
      } catch {
        // Already exists — just switch
        switchChain({ chainId: hashkeyTestnet.id });
      }
    };

    return (
      <button
        onClick={handleSwitch}
        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer"
      >
        Switch to HashKey Testnet
      </button>
    );
  }

  // Connected + correct chain
  return (
    <button
      onClick={() => disconnect()}
      title="Click to disconnect"
      className="px-4 py-2 bg-white/[6%] hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-sm font-mono rounded-xl transition-all cursor-pointer"
    >
      {address?.slice(0, 6)}...{address?.slice(-4)}
    </button>
  );
}
