export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwner } from "@/lib/ownership";

async function parentOwner(flowLinkId: string) {
  const fl = await prisma.flowLink.findUnique({
    where: { id: flowLinkId },
    select: { workflow: { select: { ownerId: true } } },
  });
  return fl?.workflow.ownerId ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPatch(body: any) {
  const data: Record<string, unknown> = {};
  const int = (v: unknown) => (typeof v === "number" && v >= 0 ? Math.round(v) : undefined);
  if (int(body.delayMinSeconds) !== undefined) data.delayMinSeconds = int(body.delayMinSeconds);
  if (int(body.delayMaxSeconds) !== undefined) data.delayMaxSeconds = int(body.delayMaxSeconds);
  if (Array.isArray(body.filterGtins)) data.filterGtins = body.filterGtins.map(String).filter(Boolean);
  if (body.filterGtins === null) data.filterGtins = null;
  if (Array.isArray(body.filterCategoryCodes))
    data.filterCategoryCodes = body.filterCategoryCodes.map(String).filter(Boolean);
  if (body.filterCategoryCodes === null) data.filterCategoryCodes = null;
  if (typeof body.isElse === "boolean") data.isElse = body.isElse;
  if (typeof body.sourceChannelId === "string" && body.sourceChannelId) data.sourceChannelId = body.sourceChannelId;
  if (typeof body.targetChannelId === "string" && body.targetChannelId) data.targetChannelId = body.targetChannelId;
  // Endpoint reconnection (BUG #10) — move a link to a different Task.
  if (typeof body.sourceTaskId === "string" && body.sourceTaskId) data.sourceTaskId = body.sourceTaskId;
  if (typeof body.targetTaskId === "string" && body.targetTaskId) data.targetTaskId = body.targetTaskId;
  return data;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerId = await parentOwner(params.id);
  if (ownerId === null) return NextResponse.json({ error: "Flow link not found" }, { status: 404 });
  if (!isOwner({ ownerId }, session.user.id)) {
    return NextResponse.json({ error: "You can only edit flow links in your own workflows." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data = buildPatch(body);

  // A reconnected endpoint (BUG #10) must land on a Task in this same workflow.
  if (typeof data.sourceTaskId === "string" || typeof data.targetTaskId === "string") {
    const link = await prisma.flowLink.findUnique({ where: { id: params.id }, select: { workflowId: true } });
    const ids = [data.sourceTaskId, data.targetTaskId].filter((v): v is string => typeof v === "string");
    const ok = await prisma.task.count({ where: { id: { in: ids }, workflowId: link?.workflowId } });
    if (ok !== ids.length) {
      return NextResponse.json({ error: "A flow link can only connect tasks in the same workflow." }, { status: 400 });
    }
  }

  const flowLink = await prisma.flowLink.update({ where: { id: params.id }, data });
  return NextResponse.json({ flowLink });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerId = await parentOwner(params.id);
  if (ownerId === null) return NextResponse.json({ error: "Flow link not found" }, { status: 404 });
  if (!isOwner({ ownerId }, session.user.id)) {
    return NextResponse.json({ error: "You can only delete flow links in your own workflows." }, { status: 403 });
  }

  await prisma.flowLink.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
