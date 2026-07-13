"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { hashkeyTestnet } from "@/lib/wagmi";
import { DropdownPortal } from "@/components/ui/DropdownPortal";
import { toast } from "@/lib/toast";

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
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const [mounted, setMounted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [connectingUid, setConnectingUid] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- required mount guard to avoid SSR/client hydration mismatch for wallet state
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!showPicker) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Element;
      // The dropdown itself lives in a body-level portal (see DropdownPortal),
      // so it's not a DOM descendant of anchorRef — check for it explicitly,
      // otherwise a click on a wallet option would register as "outside" and
      // close the menu on mousedown before the option's onClick ever fires.
      const insideAnchor = anchorRef.current?.contains(target);
      const insidePortal = target.closest?.("[data-dropdown-portal]");
      if (!insideAnchor && !insidePortal) setShowPicker(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showPicker]);

  // Avoid SSR mismatch — render nothing until client-side
  if (!mounted) {
    return (
      <div className="px-4 py-2 bg-white/[6%] border border-white/10 text-white/30 text-sm rounded-xl w-32 h-9" />
    );
  }

  // wagmi's plain injected() connector (id: "injected") always targets the
  // shared, ambiguous `window.ethereum` object. When multiple extensions are
  // installed, wallets like Coinbase Wallet monkey-patch that object with
  // their own multi-provider arbitration (evmAsk.js's `selectExtension`),
  // which intermittently throws "Unexpected error" — this is what causes
  // wallet options to randomly "not work" when clicked. EIP-6963-discovered
  // connectors instead reference their own isolated provider instance
  // directly, sidestepping that shared object entirely. So: whenever a
  // specific EIP-6963 connector is available, drop the ambiguous generic
  // "injected" one and only offer the specific, reliable ones.
  const specificConnectors = connectors.filter((c) => c.id !== "injected");
  const candidateConnectors = specificConnectors.length > 0 ? specificConnectors : connectors;
  const uniqueConnectors = candidateConnectors.filter(
    (c, i) => candidateConnectors.findIndex((c2) => c2.name === c.name) === i
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
    const handleConnect = async (connector: (typeof uniqueConnectors)[number]) => {
      setShowPicker(false);
      setConnectingUid(connector.uid);
      try {
        await connectAsync({ connector });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Connection failed";
        toast.error(`Couldn't connect ${connector.name}`, msg.slice(0, 120));
      } finally {
        setConnectingUid(null);
      }
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
      <div className="relative" ref={anchorRef}>
        <button
          onClick={() => setShowPicker((v) => !v)}
          disabled={isPending}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer"
        >
          {isPending ? "Connecting..." : "Connect Wallet"}
        </button>
        <DropdownPortal
          anchorRef={anchorRef}
          open={showPicker}
          className="w-48 bg-neutral-900 border border-white/10 rounded-xl overflow-hidden shadow-xl"
        >
          {uniqueConnectors.map((c) => (
            <button
              key={c.uid}
              onClick={() => handleConnect(c)}
              disabled={connectingUid === c.uid}
              className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {connectingUid === c.uid ? "Connecting..." : c.name}
            </button>
          ))}
        </DropdownPortal>
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
