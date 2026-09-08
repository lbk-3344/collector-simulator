import { prisma } from "@/lib/prisma";
import { makeOwnerCredentialsCache } from "@/lib/bartenderLocations";
import { sendHeartbeat } from "@/lib/bartenderDataCollector";
import { getDeviceState } from "@/lib/deviceState";
import { mapWithConcurrency } from "@/lib/concurrency";

// See lib/concurrency.ts. Devices default to a 600s heartbeat interval, so a
// fleet tends to fall due in the same rough window — same lockstep shape as
// the run engine's FeedLinks, same fix (performance review 2026-09-04,
// applied here after runTick's).
const HEARTBEAT_CONCURRENCY = 6;

// BL-072, CLAUDE-CONCEPT.md 15.10 — the DataCollector heartbeat tick. Modeled
// on lib/workflowRun.ts's runTick(): one exported async function, called by a
// thin CRON_SECRET-guarded route (app/api/cron/heartbeat-tick). An external
// per-minute scheduler drives it (Vercel Hobby cron is daily-only), same
// mechanism as workflow-tick.
//
// For every published (registered), heartbeat-enabled Device, PUT
// /collectors/{collectorId}/heartbeat once every heartbeatTimeoutSeconds.
// Never blocks anything else on a platform failure — the failure is recorded
// on the Device and surfaced as an in-modal banner (15.10 / 15.8).

export interface HeartbeatTickSummary {
  checked: number;
  sent: number;
  online: number;
  configPending: number;
  failed: number;
  autoOffline: number;
  notes: string[];
}

// BL-086 — one PUT /collectors/{id}/heartbeat + record the outcome on the
// Device. Extracted from the tick loop so the "turn a device Online" paths
// (single toggle and the map's per-site power panel) can fire an immediate
// heartbeat through the exact same code, instead of making the dashboard
// wait a full heartbeat interval to light up. Does NOT stamp
// lastHeartbeatSentAt — each caller owns that (the tick claims it
// optimistically up front; the toggle routes set it in their state write).
export async function sendAndRecordHeartbeat(
  device: { id: string; ownerId: string; collectorId: string },
  creds: { tenantUrl: string; apiKey: string }
): Promise<{ status: "ONLINE" | "CONFIG_PENDING" | "FAILED"; error?: string }> {
  const res = await sendHeartbeat(device.ownerId, creds.tenantUrl, creds.apiKey, device.collectorId);
  if (res.ok) {
    const status = res.heartbeatStatus === "CONFIG_PENDING" ? "CONFIG_PENDING" : "ONLINE";
    await prisma.device.update({
      where: { id: device.id },
      data: { lastHeartbeatStatus: status, lastHeartbeatError: null },
    });
    return { status };
  }
  await prisma.device.update({
    where: { id: device.id },
    data: { lastHeartbeatStatus: "FAILED", lastHeartbeatError: res.errorMessage ?? "heartbeat failed" },
  });
  return { status: "FAILED", error: res.errorMessage ?? "heartbeat failed" };
}

export async function runHeartbeatTick(): Promise<HeartbeatTickSummary> {
  const now = new Date();
  const summary: HeartbeatTickSummary = { checked: 0, sent: 0, online: 0, configPending: 0, failed: 0, autoOffline: 0, notes: [] };

  // BL-086 — sweep Devices whose Online window has elapsed back to Offline,
  // so a map someone opened and forgot stops sending heartbeats after an
  // hour and lets the Neon compute idle. Runs before the candidate query so
  // a just-expired Device isn't heartbeated one last time this tick.
  const swept = await prisma.device.updateMany({
    where: { autoOfflineAt: { lte: now }, offlineAt: null },
    data: { offlineAt: now, autoOfflineAt: null },
  });
  summary.autoOffline = swept.count;
  // Per-owner credentials — a published Device is registered on its owner's
  // Bartender tenant (publish uses that user's key), so its heartbeat must go
  // to the same tenant, not to one global account (2026-09-02 fix — before
  // this, every Device on a non-default tenant got COLLECTOR_NOT_FOUND).
  const credsForOwner = makeOwnerCredentialsCache();

  const candidates = await prisma.device.findMany({
    where: { heartbeatEnabled: true, publishedAt: { not: null }, collectorId: { not: null } },
    select: {
      id: true,
      ownerId: true,
      collectorId: true,
      heartbeatTimeoutSeconds: true,
      lastHeartbeatSentAt: true,
      // For the OFFLINE check below — a manually-offline Device stops being
      // ticked (BL-074). getDeviceState is the single source of truth for
      // the ACTIVE-overrides-OFFLINE precedence, so re-derive rather than
      // re-encode it as a raw Prisma filter.
      configured: true,
      publishedAt: true,
      offlineAt: true,
      tasks: { select: { workflow: { select: { status: true } } } },
    },
  });
  const devices = candidates.filter((d) => getDeviceState(d) !== "OFFLINE");

  await mapWithConcurrency(devices, HEARTBEAT_CONCURRENCY, async (device) => {
    summary.checked++;
    // heartbeatTimeoutSeconds is the send interval directly (the old /2 was
    // dropped 2026-09-08 so the stored number means exactly "seconds
    // between heartbeats").
    const intervalMs = device.heartbeatTimeoutSeconds * 1000;
    const due =
      !device.lastHeartbeatSentAt || now.getTime() - device.lastHeartbeatSentAt.getTime() >= intervalMs;
    if (!due || !device.collectorId) return;

    // Optimistic claim (same pattern as FeedLink firing in the run engine) —
    // a concurrent tick (or a concurrent worker in this same tick) can't
    // double-send for one due window.
    const claim = await prisma.device.updateMany({
      where: { id: device.id, lastHeartbeatSentAt: device.lastHeartbeatSentAt },
      data: { lastHeartbeatSentAt: now },
    });
    if (claim.count === 0) return;

    const creds = await credsForOwner(device.ownerId);
    if (!creds) {
      await prisma.device.update({
        where: { id: device.id },
        data: { lastHeartbeatStatus: "FAILED", lastHeartbeatError: "the device owner has no Bartender connection configured" },
      });
      summary.failed++;
      summary.notes.push(`heartbeat ${device.collectorId}: device owner has no Bartender connection`);
      return;
    }

    const outcome = await sendAndRecordHeartbeat(
      { id: device.id, ownerId: device.ownerId, collectorId: device.collectorId },
      creds
    );
    summary.sent++;
    if (outcome.status === "CONFIG_PENDING") summary.configPending++;
    else if (outcome.status === "ONLINE") summary.online++;
    else {
      summary.failed++;
      summary.notes.push(`heartbeat ${device.collectorId}: ${outcome.error ?? "failed"}`);
    }
  });

  return summary;
}
