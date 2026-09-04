"use client";

import { useRef, useState, type ReactNode } from "react";

// A hover/focus tooltip that renders with `position: fixed`, so it's never
// clipped by an ancestor's `overflow` (the list tables sit inside
// `.table-scroll { overflow-x: auto }`, which also clips vertically). Anchors
// to the wrapped control's top-right corner and grows up-and-left, which
// keeps it on screen for the right-aligned row-action buttons.
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  function show() {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: r.right, y: r.top });
  }
  const hide = () => setPos(null);

  return (
    <span
      ref={ref}
      className="tooltip-wrap"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {pos && (
        <span role="tooltip" className="tooltip-pop" style={{ left: pos.x, top: pos.y }}>
          {label}
        </span>
      )}
    </span>
  );
}
