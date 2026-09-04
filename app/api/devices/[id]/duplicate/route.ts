export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { suggestCollectorId } from "@/lib/deviceCollectorId";
import { isOwner } from "@/lib/ownership";

// One clone operation, two callers: the Devices-list "Duplicate" row action
// (BL-065) and the Overview map's right-click Copy/Paste/Duplicate menu
// (BL-066). See CLAUDE-CONCEPT.md section 15.9.
//
// A clone copies the source's config verbatim (type, site, model/vendor,
// heartbeat, attributes, channels, `configured`) but:
//  - `name` gets a literal " (Copy)" suffix;
//  - `collectorId` is always regenerated ({site}-{type}-{NN}) — the column is
//    @unique, copying it would throw;
//  - publish state is ALWAYS reset regardless of the source's own values
//    (Luc-confirmed) — a clone of a published Device is never auto-registered
//    on the real Bartender platform; it must be published explicitly, like
//    any other new Device. No `POST /collectors/register` here.
//  - the `task` (Workflow) relation is never carried over.
// `positionX`/`positionY` come from the request body (the map passes the
// paste/offset position; the list passes nothing → unplaced).
const DEVICE_INCLUDE = {
  tasks: { select: { id: true, name: true, workflow: { select: { id: true, name: true, status: true } } } },
} as const;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const source = await prisma.device.findUnique({ where: { id: params.id } });
  // Visibility only, not ownership — cloning a *shared* device you don't own
  // is the intended escape hatch for cross-owner composition (§17.3). The
  // clone's ownerId is always the caller (below), never the source's.
  if (!source || (!isOwner(source, session.user.id) && !source.shared)) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const positionX = typeof body?.positionX === "number" ? Math.round(body.positionX) : null;
  const positionY = typeof body?.positionY === "number" ? Math.round(body.positionY) : null;

  const collectorId = await suggestCollectorId(source.locationCode, source.type);

  let device;
  try {
    device = await prisma.device.create({
    data: {
      // The clone always lands in the caller's own workspace (§17.3), never
      // marked shared, regardless of the source's owner or shared flag.
      ownerId: session.user.id,
      shared: false,
      name: `${source.name} (Copy)`,
      collectorId,
      type: source.type,
      locationCode: source.locationCode,
      model: source.model,
      vendor: source.vendor,
      configVersion: source.configVersion,
      heartbeatEnabled: source.heartbeatEnabled,
      heartbeatTimeoutSeconds: source.heartbeatTimeoutSeconds,
      configured: source.configured,
      positionX,
      positionY,
      // Json columns: pass the source value through, or omit (column default
      // is null) — never pass a bare `null` for a Json? field.
      ...(source.attributes !== null ? { attributes: source.attributes } : {}),
      ...(source.channels !== null ? { channels: source.channels } : {}),
      // publish state — always null on a clone, never branched on the source
      publishedAt: null,
      lastSyncedAt: null,
      lastSyncError: null,
      // platformReconciliation left unset → null (column default)
    },
    include: DEVICE_INCLUDE,
    });
  } catch (e) {
    // Almost always a Device.collectorId @unique clash — shouldn't happen now
    // that suggestCollectorId scans for a free slot, but a concurrent
    // duplicate of the same source could still race. Surface it cleanly
    // instead of a 500.
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Couldn't pick a free Collector ID for the copy — try again." },
        { status: 409 }
      );
    }
    throw e;
  }

  return NextResponse.json({ device });
}
