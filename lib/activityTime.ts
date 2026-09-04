// Shared time formatting for the workflow activity views — the docked
// ActivityPanel on the canvas and the standalone ActivityModal on the
// Workflows list. A read's time alone made it impossible to tell today's
// reads from an earlier day's, so both now show a relative date line above
// the clock time.

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today" / "Yesterday" / "Sep 3" / "Sep 3, 2025". */
export function activityDateLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
  return d.toLocaleDateString(undefined, opts);
}

/** Clock time, e.g. "14:32:07" (locale-formatted). */
export function activityTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}
