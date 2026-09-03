export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwner, visibilityWhere } from "@/lib/ownership";
import { getDeviceState } from "@/lib/deviceState";
import { getUserBartenderCredentials } from "@/lib/bartenderLocations";
import { getConfiguredInStockWindowDays } from "@/lib/bartenderInventory";
import { resolveBatch, pushReadToPlatform } from "@/lib/workflowRun";
import type { DeviceChannel } from "@/lib/deviceConfig";

// Manual feed — one-off send from a Ready Device (BL-078, CLAUDE-CONCEPT.md
// §15.11). Reuses the run engine's own resolveBatch() + the platform-push
// half of emitReadAndScheduleHops(), so a manual NEW mints for real (10-item
// cap included), a manual PRESENT queries real stock, a manual FIXED sends
// the literal list — exactly like an automated firing. Deliberately NOT a
// mini workflow run: no InFlightBatch, no Flow Link fan-out, no SimulatedRead
// row (see §15.11 for the reasoning and the known "Items generated" KPI gap).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "PENDING") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const channelId = typeof body?.channelId === "string" ? body.channelId : "";
  const itemFeedId = typeof body?.itemFeedId === "string" ? body.itemFeedId : "";
  if (!channelId || !itemFeedId) {
    return NextResponse.json({ error: "channelId and itemFeedId are required" }, { status: 400 });
  }

  // Visible (owned-or-shared) → 404 if not; owner-only for this mutating
  // real-world action → 403 (§17.2), same as every other mutating route.
  const device = await prisma.device.findFirst({
    where: { AND: [{ id: params.id }, visibilityWhere(session.user.id)] },
    select: {
      id: true,
      ownerId: true,
      name: true,
      collectorId: true,
      configured: true,
      publishedAt: true,
      offlineAt: true,
      channels: true,
      task: { select: { workflow: { select: { status: true } } } },
    },
  });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  if (!isOwner(device, session.user.id)) {
    return NextResponse.json({ error: "You can only feed your own devices." }, { status: 403 });
  }

  // Re-derive the state server-side — don't trust the client's (someone may
  // have started this Device's Workflow since the page loaded).
  const state = getDeviceState(device);
  if (state !== "READY") {
    return NextResponse.json(
      { error: `Device must be Ready to feed it manually (it's ${state.toLowerCase()}).` },
      { status: 409 }
    );
  }

  const channels = (device.channels as DeviceChannel[] | null) ?? [];
  if (!channels.some((c) => c.id === channelId)) {
    return NextResponse.json({ error: "That channel doesn't belong to this device." }, { status: 400 });
  }

  // Caller's own feeds only — a shared-to-you feed must be duplicated into
  // your own library first (§15.11, mirrors §17.3's canvas rule).
  const feed = await prisma.itemFeed.findUnique({ where: { id: itemFeedId } });
  if (!feed || feed.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Item feed not found" }, { status: 404 });
  }

  // Caller's own Bartender connection (the apikey-header credential — same
  // shape as RunCredentials). null when unset — resolveBatch / push
  // surface that as this firing's note rather than a hard failure, same as
  // the automated engine.
  const creds = await getUserBartenderCredentials(session.user.id).catch(() => null);
  const inStockWindowDays =
    feed.kind === "PRESENT" && creds
      ? await getConfiguredInStockWindowDays(session.user.id, creds.tenantUrl, creds.apiKey)
      : null;

  const batch = await resolveBatch(session.user.id, feed, creds, inStockWindowDays);

  let pushed = false;
  let pushNote: string | undefined;
  if (batch.items.length > 0) {
    const res = await pushReadToPlatform({
      ownerId: session.user.id,
      creds,
      collectorId: device.collectorId,
      channelId,
      items: batch.items,
      at: new Date(),
    });
    pushed = res.pushed;
    pushNote = res.note;
  }

  return NextResponse.json({
    itemsResolved: batch.items.length,
    pushed,
    note: batch.note ?? pushNote ?? null,
  });
}
