"use client";

import { useState } from "react";

// The app's only copy-to-clipboard control (BL-076). Shows a brief "Copied"
// state on the button itself — no toast system exists and none is warranted
// for this.
export function CopyButton({
  text,
  label = "Copy",
  className = "btn btn-secondary small",
}: {
  text: string | (() => string);
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context / permissions) — leave the label as-is.
    }
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {copied ? "Copied" : label}
    </button>
  );
}
