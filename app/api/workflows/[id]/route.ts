export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwner } from "@/lib/ownership";
import { bustCronClock } from "@/lib/cronClock";
import { waitUntil } from "@/lib/vercelWaitUntil";
import { getUserBartenderCredentials } from "@/lib/bartenderLocations";
import { sendAndRecordHeartbeat } from "@/lib/deviceHeartbeat";
import { mapWithConcurrency } from "@/lib/concurrency";

const WORKFLOW_INCLUDE = {
  tasks: {
    include: {
      device: { select: { id: true, name: true, type: true, collectorId: true, channels: true } },
    },
  },
  feedNodes: {
    include: { itemFeed: { select: { id: true, name: true, kind: true, gtins: true, presentMatchMode: true } } },
  },
  feedLinks: true,
  flowLinks: true,
} as const;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workflow = await prisma.workflow.findUnique({ where: { id: params.id }, include: WORKFLOW_INCLUDE });
  if (!workflow || (!isOwner(workflow, session.user.id) && !workflow.shared)) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }
  return NextResponse.json({ workflow, currentUserId: session.user.id });
}

// PATCH: rename, edit maxRunDurationMinutes, and Run/Stop.
//  - flip to RUNNING  → set runningStartedAt = now, clear autoStoppedAt
//  - flip to STOPPED (by a user) → clear runningStartedAt
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Owner-only — rename, maxRunDuration, and Run/Stop are all mutations
  // (BL-067, §17.2). A shared workflow is read-only to non-owners.
  const owned = await prisma.workflow.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  if (!owned) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  if (!isOwner(owned, session.user.id)) {
    return NextResponse.json({ error: "You can only edit your own workflows." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (
    typeof body.maxRunDurationMinutes === "number" &&
    Number.isFinite(body.maxRunDurationMinutes) &&
    body.maxRunDurationMinutes > 0
  ) {
    data.maxRunDurationMinutes = Math.round(body.maxRunDurationMinutes);
  }
  if (body.status === "RUNNING" || body.status === "STOPPED") {
    data.status = body.status;
    if (body.status === "RUNNING") {
      data.runningStartedAt = new Date();
      data.autoStoppedAt = null;
    } else {
      data.runningStartedAt = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const workflow = await prisma.workflow.update({ where: { id: params.id }, data, include: WORKFLOW_INCLUDE });
    if (data.status === "RUNNING") {
      // Pull the cron skip-gate's clock back to now so the next tick runs in
      // full instead of waiting out the idle horizon (lib/cronClock.ts).
      waitUntil(bustCronClock());
      // Devices are Offline by default (BL-086) and the platform only knows a
      // Collector is alive from its heartbeat — not from the reads a run
      // sends it. Fire one heartbeat per workflow device now so they show
      // ONLINE on Track & Trace as soon as the run starts, rather than after
      // the next heartbeat tick (up to `heartbeatTimeoutSeconds` later).
      waitUntil(heartbeatWorkflowDevices(params.id, session.user.id));
    }
    return NextResponse.json({ workflow });
  } catch {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }
}

// Best-effort immediate heartbeat for every published, heartbeat-enabled
// device attached to a workflow. Runs in waitUntil() — never blocks or fails
// the start; the regular heartbeat tick (§15.10) keeps them alive afterward.
async function heartbeatWorkflowDevices(workflowId: string, ownerId: string): Promise<void> {
  const tasks = await prisma.task.findMany({
    where: { workflowId },
    select: {
      device: {
        select: { id: true, ownerId: true, collectorId: true, heartbeatEnabled: true, publishedAt: true },
      },
    },
  });
  const seen = new Set<string>();
  const devices = tasks
    .map((t) => t.device)
    .filter((d): d is NonNullable<typeof d> => {
      if (!d || !d.collectorId || !d.publishedAt || !d.heartbeatEnabled) return false;
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
  if (devices.length === 0) return;

  const creds = await getUserBartenderCredentials(ownerId).catch(() => null);
  if (!creds) return;

  // Stamp first so the heartbeat tick doesn't immediately re-send this batch.
  await prisma.device.updateMany({
    where: { id: { in: devices.map((d) => d.id) } },
    data: { lastHeartbeatSentAt: new Date() },
  });
  await mapWithConcurrency(devices, 6, async (d) => {
    try {
      await sendAndRecordHeartbeat(
        { id: d.id, ownerId: d.ownerId, collectorId: d.collectorId as string },
        creds
      );
    } catch {
      /* best-effort — the heartbeat tick retries */
    }
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await prisma.workflow.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  if (!owned) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  if (!isOwner(owned, session.user.id)) {
    return NextResponse.json({ error: "You can only delete your own workflows." }, { status: 403 });
  }

  await prisma.workflow.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
