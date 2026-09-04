export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildDeviceConfigData, resolveConfigVersion, validateChannels } from "@/lib/deviceConfig";
import { buildPlatformSyncData, toRegistrableDevice } from "@/lib/deviceSync";
import { getUserBartenderCredentials } from "@/lib/bartenderLocations";
import { deregisterCollector } from "@/lib/bartenderDataCollector";
import { isOwner } from "@/lib/ownership";

const DEVICE_INCLUDE = {
  tasks: { select: { id: true, name: true, workflow: { select: { id: true, name: true, status: true } } } },
} as const;

// A prisma.device.update can fail for reasons other than "record gone" — most
// importantly a Collector ID clash (@unique). Map those to a clear message;
// return null for anything unexpected so the caller rethrows (real 500).
function updateErrorResponse(e: unknown): NextResponse | null {
  const code = e && typeof e === "object" ? (e as { code?: string }).code : undefined;
  if (code === "P2002") {
    return NextResponse.json(
      { error: "That Collector ID is already used by another device — pick a different one." },
      { status: 409 }
    );
  }
  if (code === "P2025") {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }
  return null;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const device = await prisma.device.findUnique({
    where: { id: params.id },
    include: DEVICE_INCLUDE,
  });
  // 404 (not 403) for a device the caller neither owns nor has shared to
  // them — don't confirm the id exists (BL-067, §17.2).
  if (!device || (!isOwner(device, session.user.id) && !device.shared)) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  return NextResponse.json({ device });
}

// Two distinct shapes of update, per CLAUDE-CONCEPT.md section 15.4/15.5:
//  - Position-only (Overview map Edit-mode drag-to-reposition): only
//    positionX/positionY are touched, nothing else — "sans conséquences sur
//    sa configuration" (Luc's own words). Signaled by the absence of `name`.
//  - Full config save (the device config screen, BL-045): every field, sets
//    configured: true and auto-populates the single default Channel from
//    collectorId. Signaled by the presence of `name` — the config screen
//    always sends it, a position-only drag never does.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Owner-only mutation (BL-067, §17.2) — shared is read-only to everyone
  // else, ADMIN included. Publish (below) is just another mutating PATCH.
  const owned = await prisma.device.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  if (!owned) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  if (!isOwner(owned, session.user.id)) {
    return NextResponse.json({ error: "You can only edit your own devices." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const isConfigSave = typeof body?.name === "string";

  if (!isConfigSave) {
    const data = buildPositionData(body);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    try {
      const device = await prisma.device.update({
        where: { id: params.id },
        data,
        include: DEVICE_INCLUDE,
      });
      return NextResponse.json({ device });
    } catch (e) {
      return updateErrorResponse(e) ?? NextResponse.json({ error: "Couldn't save this device." }, { status: 500 });
    }
  }

  const channelsError = validateChannels(body);
  if (channelsError) {
    return NextResponse.json({ error: channelsError }, { status: 400 });
  }

  const existing = await prisma.device.findUnique({
    where: { id: params.id },
    select: { configVersion: true, publishedAt: true, locationCode: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  // Changing the Site invalidates any saved map position — the coords are in
  // floor-plan pixels of the *previous* Site's plan. Clear them so the device
  // shows as "unplaced" on the new Site's map, ready to be dragged into place
  // (LocationMapCard stages null-position devices near the top-left).
  const siteChanged = Boolean(existing.locationCode) && body.locationCode !== existing.locationCode;

  // A save syncs to the platform if the Device is already published, or this
  // save is an explicit Publish (section 15.8).
  const willSync = Boolean(existing.publishedAt) || body.publish === true;
  // configVersion: auto-increment only on a syncing save the user didn't
  // touch, and only for a purely-numeric stored value.
  body.configVersion = resolveConfigVersion(existing.configVersion, body.configVersion, willSync);

  let data = buildDeviceConfigData(body);
  if (willSync) {
    const syncData = await buildPlatformSyncData(
      session.user.id,
      toRegistrableDevice(data),
      Boolean(existing.publishedAt)
    );
    data = { ...data, ...syncData } as typeof data;
  }

  try {
    const device = await prisma.device.update({
      where: { id: params.id },
      data: siteChanged ? { ...data, positionX: null, positionY: null } : data,
      include: DEVICE_INCLUDE,
    });
    return NextResponse.json({ device });
  } catch (e) {
    return updateErrorResponse(e) ?? NextResponse.json({ error: "Couldn't save this device." }, { status: 500 });
  }
}

// `?deregister=true` (BL-054) additionally calls DELETE /collectors/{id} on
// the real platform *before* the local delete — opt-in, asked every time by
// the client, only meaningful for a published Device. The local row is
// deleted regardless of the remote call's outcome; a remote failure comes
// back as `platformDeregisterError` for a follow-up warning, never a block.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const device = await prisma.device.findUnique({
    where: { id: params.id },
    select: { ownerId: true, collectorId: true, publishedAt: true },
  });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  if (!isOwner(device, session.user.id)) {
    return NextResponse.json({ error: "You can only delete your own devices." }, { status: 403 });
  }

  const wantDeregister = new URL(req.url).searchParams.get("deregister") === "true";
  let platformDeregisterError: string | undefined;

  if (wantDeregister) {
    if (device.publishedAt && device.collectorId) {
      try {
        const creds = await getUserBartenderCredentials(session.user.id);
        if (!creds) {
          platformDeregisterError = "No Bartender connection configured.";
        } else {
          const result = await deregisterCollector(session.user.id, creds.tenantUrl, creds.apiKey, device.collectorId);
          if (!result.ok) {
            platformDeregisterError = result.errorMessage ?? "The deregister call failed.";
          }
        }
      } catch {
        platformDeregisterError = "The stored Bartender API key could not be decrypted.";
      }
    }
  }

  try {
    await prisma.device.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ...(platformDeregisterError ? { platformDeregisterError } : {}) });
}

function buildPositionData(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  if (typeof body.positionX === "number") data.positionX = body.positionX;
  if (typeof body.positionY === "number") data.positionY = body.positionY;
  return data;
}
