export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildDeviceConfigData, validateChannels } from "@/lib/deviceConfig";
import { buildPlatformSyncData, toRegistrableDevice } from "@/lib/deviceSync";
import { visibilityWhere } from "@/lib/ownership";

const DEVICE_INCLUDE = {
  task: { select: { id: true, name: true, workflow: { select: { id: true, name: true, status: true } } } },
} as const;

// This app's own simulated Devices/Collectors (not Bartender's real
// DataCollector concept — see CLAUDE-CONCEPT.md section 14.2/15). Powers the
// Overview location map (BL-038), the Devices-online KPI (BL-039/BL-043),
// and the tenant-wide Devices list (BL-047).
//
// GET with a locationCode filters to that site (map/KPI use); without one,
// returns every Device tenant-wide (Devices list use) — mirrors the real
// DataCollector API's own two-tier listing (section 7.5).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locationCode = req.nextUrl.searchParams.get("locationCode");

  // Owner-or-shared visibility (BL-067) AND-ed with the optional site filter.
  const devices = await prisma.device.findMany({
    where: {
      AND: [visibilityWhere(session.user.id), ...(locationCode ? [{ locationCode }] : [])],
    },
    include: DEVICE_INCLUDE,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ devices });
}

// Two distinct creation shapes, matching PATCH's config-save/position-only
// split (see [id]/route.ts):
//  - Shell (no `name` in the body): a brand-new, not-yet-configured row
//    dropped from the Overview map's Edit-mode palette — type + locationCode
//    + position only, configured: false (CLAUDE-CONCEPT.md section 15.5).
//    The config screen then PATCHes it to complete configuration.
//  - Full config create (`name` present): the Devices list's "+ Add device"
//    (BL-047) has no map-drop position to pre-create a shell from, so it
//    saves the whole form in one POST, configured: true immediately.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const type = typeof body?.type === "string" ? body.type : "";
  const locationCode = typeof body?.locationCode === "string" ? body.locationCode : "";
  if (!type || !locationCode) {
    return NextResponse.json({ error: "type and locationCode are required" }, { status: 400 });
  }

  const isConfigCreate = typeof body?.name === "string";
  if (isConfigCreate) {
    const channelsError = validateChannels(body);
    if (channelsError) {
      return NextResponse.json({ error: channelsError }, { status: 400 });
    }
    // Brand-new full config: default configVersion to "1" when empty. No
    // auto-increment here — nothing to increment from (section 15.8).
    if (!(typeof body.configVersion === "string" && body.configVersion.trim())) {
      body.configVersion = "1";
    }
  }

  // ownerId is always the session user (BL-067) — never client-supplied.
  let data = isConfigCreate
    ? { ...buildDeviceConfigData(body), ownerId: session.user.id }
    : {
        name: `New ${type}`,
        type,
        locationCode,
        positionX: typeof body?.positionX === "number" ? body.positionX : null,
        positionY: typeof body?.positionY === "number" ? body.positionY : null,
        configured: false,
        ownerId: session.user.id,
      };

  // Publish to the real platform (BL-053) — only on an explicit publish of a
  // full config. Never blocks the local create; a failure just records
  // lastSyncError and leaves publishedAt null (Device stays grey).
  if (isConfigCreate && body.publish === true) {
    const syncData = await buildPlatformSyncData(
      session.user.id,
      toRegistrableDevice(data),
      false
    );
    data = { ...data, ...syncData } as typeof data;
  }

  const device = await prisma.device.create({
    data,
    include: DEVICE_INCLUDE,
  });

  return NextResponse.json({ device });
}
