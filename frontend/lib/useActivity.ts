"use client";

import { useEffect, useState } from "react";
import { getActivity, subscribeActivity, type ActivityItem } from "./activity";

export function useActivity(address?: string | null): ActivityItem[] {
  const [items, setItems] = useState<ActivityItem[]>(() => getActivity(address));

  useEffect(() => {
    const sync = () => setItems(getActivity(address));
    sync(); // re-sync immediately when the tracked address changes
    return subscribeActivity(sync);
  }, [address]);

  return items;
}
