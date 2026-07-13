"use client";

import { useLayoutEffect, useState, type RefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Rect {
  top: number;
  left: number;
  right: number;
}

interface DropdownPortalProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}

/**
 * Renders dropdown content directly into document.body via a portal, at a
 * position computed from the anchor's bounding box.
 *
 * Why: elements using `backdrop-filter` (our `.glass` cards) get promoted to
 * their own compositing layer in Chromium-based browsers (Arc, Chrome), which
 * can visually paint on top of `position: absolute` dropdowns even when the
 * dropdown has a higher z-index — the z-index only holds within the local
 * stacking context. Escaping to a body-level portal with `position: fixed`
 * sidesteps that entirely.
 */
export function DropdownPortal({ anchorRef, open, align = "right", className = "", children }: DropdownPortalProps) {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setRect(null);
      return;
    }
    const update = () => {
      if (!anchorRef.current) return;
      const r = anchorRef.current.getBoundingClientRect();
      setRect({ top: r.bottom, left: r.left, right: window.innerWidth - r.right });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef]);

  if (!open || !rect || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-dropdown-portal="true"
      className={className}
      style={{
        position: "fixed",
        top: rect.top + 8,
        zIndex: 9999,
        ...(align === "right" ? { right: rect.right } : { left: rect.left }),
      }}
    >
      {children}
    </div>,
    document.body
  );
}
