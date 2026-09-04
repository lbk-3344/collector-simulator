// Bounded-concurrency map (BL-081, performance review 2026-09-04). Shared by
// the two CRON_SECRET-guarded ticks (lib/workflowRun.ts's runTick, and
// lib/deviceHeartbeat.ts's runHeartbeatTick): a batch of independent
// per-row work — firings, arrivals, heartbeats — is processed with at most
// `limit` in flight at once instead of one row at a time. Both ticks' rows
// are independent of each other (different tasks/channels/devices) and
// every DB "claim" they take is a per-row atomic `updateMany`, so this is
// safe. A bound (rather than unlimited `Promise.all`) avoids hammering the
// Bartender platform with an entire due batch in one instant.
export async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
