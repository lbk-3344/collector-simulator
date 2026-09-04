import { prisma } from "@/lib/prisma";
import { makeOwnerCredentialsCache } from "@/lib/bartenderLocations";
import { sendHeartbeat } from "@/lib/bartenderDataCollector";
import { getDeviceState } from "@/lib/deviceState";
import { mapWithConcurrency } from "@/lib/concurrency";

// See lib/concurrency.ts. Devices default to a 120s heartbeat timeout
// (ticked every half that), so a fleet tends to fall due in the same rough
// window — same lockstep shape as the run engine's FeedLinks, same fix
// (performance review 2026-09-04, applied here after runTick's).
const HEARTBEAT_CONCURRENCY = 6;

// BL-072, CLAUDE-CONCEPT.md 15.10 — the DataCollector heartbeat tick. Modeled
// on lib/workflowRun.ts's runTick(): one exported async function, called by a
// thin CRON_SECRET-guarded route (app/api/cron/heartbeat-tick). An external
// per-minute scheduler drives it (Vercel Hobby cron is daily-only), same
// mechanism as workflow-tick.
//
// For every published (registered), heartbeat-enabled Device, PUT
// /collectors/{collectorId}/heartbeat once every heartbeatTimeoutSeconds/2.
// Never blocks anything else on a platform failure — the failure is recorded
// on the Device and surfaced as an in-modal banner (15.10 / 15.8).

export interface HeartbeatTickSummary {
  checked: number;
  sent: number;
  online: number;
  configPending: number;
  failed: number;
  notes: string[];
}

export async function runHeartbeatTick(): Promise<HeartbeatTickSummary> {
  const now = new Date();
  const summary: HeartbeatTickSummary = { checked: 0, sent: 0, online: 0, configPending: 0, failed: 0, notes: [] };
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
    const intervalMs = (device.heartbeatTimeoutSeconds / 2) * 1000;
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

    const res = await sendHeartbeat(device.ownerId, creds.tenantUrl, creds.apiKey, device.collectorId);
    summary.sent++;
    if (res.ok) {
      const status = res.heartbeatStatus === "CONFIG_PENDING" ? "CONFIG_PENDING" : "ONLINE";
      await prisma.device.update({
        where: { id: device.id },
        data: { lastHeartbeatStatus: status, lastHeartbeatError: null },
      });
      if (status === "CONFIG_PENDING") summary.configPending++;
      else summary.online++;
    } else {
      await prisma.device.update({
        where: { id: device.id },
        data: { lastHeartbeatStatus: "FAILED", lastHeartbeatError: res.errorMessage ?? "heartbeat failed" },
      });
      summary.failed++;
      summary.notes.push(`heartbeat ${device.collectorId}: ${res.errorMessage ?? "failed"}`);
    }
  });

  return summary;
}
