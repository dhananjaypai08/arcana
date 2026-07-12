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

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export function ConnectWallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const [mounted, setMounted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- required mount guard to avoid SSR/client hydration mismatch for wallet state
    setMounted(true);
  }, []);

  // Avoid SSR mismatch — render nothing until client-side
  if (!mounted) {
    return (
      <div className="px-4 py-2 bg-white/[6%] border border-white/10 text-white/30 text-sm rounded-xl w-32 h-9" />
    );
  }

  // De-dupe connectors by name (EIP-6963 discovery + explicit injected() can overlap)
  const uniqueConnectors = connectors.filter(
    (c, i) => connectors.findIndex((c2) => c2.name === c.name) === i
  );

  // No wallet extensions detected at all
  if (uniqueConnectors.length === 0) {
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

  // Not connected — let wagmi talk to each connector's own isolated provider.
  // Never touch window.ethereum directly: with multiple wallet extensions
  // installed (Coinbase Wallet, MetaMask, Arc's own wallet, etc.) it becomes
  // an ambiguous multi-provider proxy and throws "Unexpected error" from
  // evmAsk.js's internal selectExtension arbitration.
  if (!isConnected) {
    const handleConnect = (connector: (typeof uniqueConnectors)[number]) => {
      setShowPicker(false);
      connect({ connector });
    };

    // Single wallet available — connect directly, no picker needed
    if (uniqueConnectors.length === 1) {
      return (
        <button
          onClick={() => handleConnect(uniqueConnectors[0])}
          disabled={isPending}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer"
        >
          {isPending ? "Connecting..." : "Connect Wallet"}
        </button>
      );
    }

    // Multiple wallets — let the user pick which one to use
    return (
      <div className="relative">
        <button
          onClick={() => setShowPicker((v) => !v)}
          disabled={isPending}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer"
        >
          {isPending ? "Connecting..." : "Connect Wallet"}
        </button>
        {showPicker && (
          <div className="absolute right-0 top-full mt-2 w-48 bg-neutral-900 border border-white/10 rounded-xl overflow-hidden shadow-xl z-50">
            {uniqueConnectors.map((c) => (
              <button
                key={c.uid}
                onClick={() => handleConnect(c)}
                className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p className="absolute right-0 top-full mt-1 text-xs text-red-400 whitespace-nowrap">
            {error.message.slice(0, 60)}
          </p>
        )}
      </div>
    );
  }

  // Connected but wrong chain
  if (chainId !== hashkeyTestnet.id) {
    const handleSwitch = async () => {
      try {
        await switchChain({ chainId: hashkeyTestnet.id });
      } catch {
        // Chain not known to wallet yet — ask it to add + switch in one step
        try {
          const provider = window.ethereum as Eip1193Provider | undefined;
          await provider?.request({
            method: "wallet_addEthereumChain",
            params: [HASHKEY_TESTNET],
          });
        } catch (err) {
          console.error("Failed to add HashKey Testnet:", err);
        }
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
