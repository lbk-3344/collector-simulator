"use client";

import { useState } from "react";
import { useDialog } from "@/components/AppDialog";
import { Tooltip } from "@/components/Tooltip";

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

// Eye with a diagonal slash — the common "hide / not shown" convention.
function EyeSlashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 10S5.5 4.5 10 4.5s7.5 5.5 7.5 5.5-3 5.5-7.5 5.5S2.5 10 2.5 10Z" />
      <circle cx="10" cy="10" r="2.2" />
      <line x1="3" y1="17" x2="17" y2="3" />
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
    <Tooltip label={`Hide this shared ${KIND_LABEL[kind]} from your view — restore it any time from Settings → Hidden items`}>
      <button
        type="button"
        className="row-icon-btn row-icon-btn-ghost"
        aria-label="Hide from my view"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          run();
        }}
      >
        <EyeSlashIcon />
      </button>
    </Tooltip>
  );
}
