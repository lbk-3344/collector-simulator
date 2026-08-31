// "Shared" read-only badge (BL-068, CHARTE "'Shared' badge") — marks a
// Device/Workflow/Item Feed row or a canvas that the viewer can see only
// because it's `shared`, not because they own it. Closed-padlock glyph +
// "Shared", using the tint-based `.chip` family.
export function PadlockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="9" width="11" height="8" rx="1.6" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}

export function SharedBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`chip chip-shared ${className}`.trim()} title="Shared with you — read-only">
      <PadlockIcon />
      Shared
    </span>
  );
}
