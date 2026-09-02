export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwner } from "@/lib/ownership";
import { getDeviceState } from "@/lib/deviceState";

const DEVICE_INCLUDE = {
  task: { select: { id: true, name: true, workflow: { select: { id: true, name: true, status: true } } } },
} as const;

// Manual OFFLINE toggle (BL-074, CLAUDE-CONCEPT.md §15.3/15.7). Owner-only,
// mirroring the [id]/route.ts PATCH guard. A Device can only be toggled
// between READY and OFFLINE — never from PENDING (publish it first) or
// ACTIVE (stop its Workflow instead). The client is not trusted to enforce
// that: the state is re-derived server-side.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body?.offline !== "boolean") {
    return NextResponse.json({ error: "offline (boolean) is required" }, { status: 400 });
  }

  const device = await prisma.device.findUnique({
    where: { id: params.id },
    select: { ownerId: true, configured: true, publishedAt: true, offlineAt: true, task: { select: { workflow: { select: { status: true } } } } },
  });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  if (!isOwner(device, session.user.id)) {
    return NextResponse.json({ error: "You can only edit your own devices." }, { status: 403 });
  }

  const state = getDeviceState(device);
  if (state !== "READY" && state !== "OFFLINE") {
    return NextResponse.json(
      { error: "Device must be Ready to change its offline status." },
      { status: 409 }
    );
  }

  const updated = await prisma.device.update({
    where: { id: params.id },
    data: { offlineAt: body.offline ? new Date() : null },
    include: DEVICE_INCLUDE,
  });
  return NextResponse.json({ device: updated });
}
