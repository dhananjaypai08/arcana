import { useEffect, useState } from "react";

/**
 * True only after the component has mounted on the client.
 *
 * Wagmi's `useAccount().isConnected` is always `false` during SSR (there's
 * no wallet during server rendering) but can immediately be `true` on the
 * client's first paint if a previous session auto-reconnects. Branching a
 * page's top-level markup directly on `isConnected` therefore renders
 * different HTML on the server vs. the client's first render pass, which
 * React flags as a hydration mismatch.
 *
 * Gate any such branch on `useMounted()` too (e.g. `!mounted || !isConnected`)
 * so both the server and the client's initial paint render the same
 * "unmounted" markup; the real wallet-aware branch only kicks in after the
 * mount effect fires, which happens after hydration has already committed.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
