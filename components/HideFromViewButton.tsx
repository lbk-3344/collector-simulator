"use client";

import { useState } from "react";
import { useDialog } from "@/components/AppDialog";

// BL-079 (§17.7) — row action shown only on a shared-not-owned Device /
// Workflow / Item Feed row (the inverse of Delete, which is for owned rows).
// Removes the resource from *this user's* view only; reversible from
// Settings → Hidden items. Confirms first since it's a durable action.
type Kind = "device" | "workflow" | "itemFeed";

const KIND_LABEL: Record<Kind, string> = { device: "device", workflow: "workflow", itemFeed: "item feed" };
const KIND_PATH: Record<Kind, string> = {
  device: "/api/devices",
  workflow: "/api/workflows",
  itemFeed: "/api/item-feeds",
};

function EyeSlashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 10S5.5 4.5 10 4.5c1.4 0 2.7.5 3.8 1.2M17.5 10s-1 1.9-2.9 3.4M11.8 11.8a2.5 2.5 0 0 1-3.5-3.5" />
      <path d="M8.3 5.1A6.9 6.9 0 0 1 10 4.9" />
      <line x1="3" y1="3" x2="17" y2="17" />
    </svg>
  );
}

export function HideFromViewButton({
  kind,
  id,
  name,
  onHidden,
  onError,
}: {
  kind: Kind;
  id: string;
  name: string;
  onHidden: () => void;
  onError?: (message: string) => void;
}) {
  const { confirm } = useDialog();
  const [busy, setBusy] = useState(false);

  async function run() {
    const ok = await confirm({
      variant: "warning",
      title: "Remove from your view",
      message: `Remove the shared ${KIND_LABEL[kind]} "${name}" from your view? You can bring it back later from Settings → Hidden items.`,
      confirmLabel: "Remove from my view",
      cancelLabel: "Keep",
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`${KIND_PATH[kind]}/${id}/hide`, { method: "POST" });
    setBusy(false);
    if (res.ok) onHidden();
    else {
      const data = await res.json().catch(() => null);
      onError?.(data?.error ?? "Couldn't remove this item from your view.");
    }
  }

  return (
    <button
      type="button"
      className="row-icon-btn row-icon-btn-ghost"
      aria-label="Remove from my view"
      title="Remove this shared item from your view — restore it later from Settings → Hidden items"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        run();
      }}
    >
      <EyeSlashIcon />
    </button>
  );
}
