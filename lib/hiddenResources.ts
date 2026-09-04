import { prisma } from "@/lib/prisma";

// BL-079 (§17.7) — shared logic for the three `[id]/hide` routes. Hiding
// only ever applies to a resource that is shared AND not owned by the
// caller; every other case (own it, not visible at all) resolves to a plain
// 404, matching §17.2's "don't confirm a record exists" posture. Hiding an
// already-hidden row is a no-op (ok:true), not an error, and unhide is
// likewise idempotent.

export type HiddenKind = "device" | "workflow" | "itemFeed";

export type HideResult = { ok: true } | { ok: false; status: 404 };

// May the caller hide this resource? True only when it exists, is `shared`,
// and is NOT owned by the caller. Deliberately checks the raw shared/owner
// state (not `visibilityWhere`, which also subtracts already-hidden rows) so
// that a second hide of the same row is a no-op rather than a 404.
async function findHideable(kind: HiddenKind, userId: string, id: string): Promise<boolean> {
  const select = { ownerId: true, shared: true } as const;
  let row: { ownerId: string; shared: boolean } | null;
  if (kind === "device") {
    row = await prisma.device.findUnique({ where: { id }, select });
  } else if (kind === "workflow") {
    row = await prisma.workflow.findUnique({ where: { id }, select });
  } else {
    row = await prisma.itemFeed.findUnique({ where: { id }, select });
  }
  return row != null && row.shared && row.ownerId !== userId;
}

export async function hideResource(kind: HiddenKind, userId: string, id: string): Promise<HideResult> {
  if (!(await findHideable(kind, userId, id))) return { ok: false, status: 404 };

  if (kind === "device") {
    await prisma.hiddenDevice.upsert({
      where: { userId_deviceId: { userId, deviceId: id } },
      create: { userId, deviceId: id },
      update: {},
    });
  } else if (kind === "workflow") {
    await prisma.hiddenWorkflow.upsert({
      where: { userId_workflowId: { userId, workflowId: id } },
      create: { userId, workflowId: id },
      update: {},
    });
  } else {
    await prisma.hiddenItemFeed.upsert({
      where: { userId_itemFeedId: { userId, itemFeedId: id } },
      create: { userId, itemFeedId: id },
      update: {},
    });
  }
  return { ok: true };
}

export async function unhideResource(kind: HiddenKind, userId: string, id: string): Promise<HideResult> {
  // No visibility gate — restoring something you hid is always allowed, even
  // if the admin has since un-shared it (the row just won't reappear until
  // it's shared again). deleteMany so a missing row is a no-op, not a throw.
  if (kind === "device") {
    await prisma.hiddenDevice.deleteMany({ where: { userId, deviceId: id } });
  } else if (kind === "workflow") {
    await prisma.hiddenWorkflow.deleteMany({ where: { userId, workflowId: id } });
  } else {
    await prisma.hiddenItemFeed.deleteMany({ where: { userId, itemFeedId: id } });
  }
  return { ok: true };
}
