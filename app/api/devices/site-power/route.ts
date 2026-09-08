export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDeviceState, AUTO_OFFLINE_MINUTES } from "@/lib/deviceState";
import { getUserBartenderCredentials } from "@/lib/bartenderLocations";
import { sendAndRecordHeartbeat } from "@/lib/deviceHeartbeat";
import { mapWithConcurrency } from "@/lib/concurrency";
import { visibilityWhere } from "@/lib/ownership";

const DEVICE_INCLUDE = {
  tasks: { select: { id: true, name: true, workflow: { select: { id: true, name: true, status: true } } } },
} as const;

// Heartbeat a handful of just-turned-on Devices at a bound (same reasoning as
// lib/deviceHeartbeat.ts — don't fire an entire site's worth at the platform
// in one instant).
const POWER_HEARTBEAT_CONCURRENCY = 6;

// BL-086 — the map's per-site power panel (shown when the map is NOT in Edit
// mode). Bulk-toggle the caller's OWN published devices at one site between
// Ready and Offline in a single call, so someone can bring a whole floor
// online for a bounded 1h window and take it back offline when done. Only
// devices actually in the flippable state are touched:
//   - online:  Offline devices  -> Online (autoOfflineAt = now + 1h) + an
//              immediate heartbeat each, so the dashboard lights up in
//              seconds rather than after a full heartbeat interval.
//   - offline: Ready devices    -> Offline (autoOfflineAt cleared).
// Pending (not published) and Active (in a running workflow) devices are
// skipped — same rule as the single toggle in [id]/offline/route.ts.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const locationCode = typeof body?.locationCode === "string" ? body.locationCode.trim() : "";
  if (!locationCode) {
    return NextResponse.json({ error: "locationCode is required" }, { status: 400 });
  }
  if (typeof body?.online !== "boolean") {
    return NextResponse.json({ error: "online (boolean) is required" }, { status: 400 });
  }
  const turningOn: boolean = body.online;

  // Caller's own devices at this site (bulk power never touches shared ones).
  const devices = await prisma.device.findMany({
    where: { ownerId: session.user.id, locationCode },
    select: {
      id: true,
      ownerId: true,
      collectorId: true,
      heartbeatEnabled: true,
      configured: true,
      publishedAt: true,
      offlineAt: true,
      tasks: { select: { workflow: { select: { status: true } } } },
    },
  });

  const wantState = turningOn ? "OFFLINE" : "READY";
  const targets = devices.filter((d) => getDeviceState(d) === wantState);

  const now = new Date();
  if (targets.length > 0) {
    if (turningOn) {
      await prisma.device.updateMany({
        where: { id: { in: targets.map((d) => d.id) } },
        data: {
          offlineAt: null,
          autoOfflineAt: new Date(now.getTime() + AUTO_OFFLINE_MINUTES * 60_000),
        },
      });
      // Stamp lastHeartbeatSentAt only for the ones we're about to heartbeat,
      // so the tick doesn't immediately re-send; ones with heartbeat disabled
      // or no collector are left as-is.
      const beatable = targets.filter((d) => d.heartbeatEnabled && d.collectorId);
      if (beatable.length > 0) {
        await prisma.device.updateMany({
          where: { id: { in: beatable.map((d) => d.id) } },
          data: { lastHeartbeatSentAt: now },
        });
        const creds = await getUserBartenderCredentials(session.user.id).catch(() => null);
        if (creds) {
          await mapWithConcurrency(beatable, POWER_HEARTBEAT_CONCURRENCY, async (d) => {
            try {
              await sendAndRecordHeartbeat(
                { id: d.id, ownerId: d.ownerId, collectorId: d.collectorId as string },
                creds
              );
            } catch {
              // swallowed — Device is Online regardless; next tick retries.
            }
          });
        }
      }
    } else {
      await prisma.device.updateMany({
        where: { id: { in: targets.map((d) => d.id) } },
        data: { offlineAt: now, autoOfflineAt: null },
      });
    }
  }

  // Return the whole site's devices fresh so the panel and the map markers
  // re-render from one payload (same shape as GET /api/devices?locationCode=).
  const refreshed = await prisma.device.findMany({
    where: { AND: [visibilityWhere(session.user.id), { locationCode }] },
    include: DEVICE_INCLUDE,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    changed: targets.length,
    devices: refreshed,
    currentUserId: session.user.id,
  });
}
