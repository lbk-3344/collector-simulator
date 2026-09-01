export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwner } from "@/lib/ownership";

async function parentOwner(feedLinkId: string) {
  const fl = await prisma.feedLink.findUnique({
    where: { id: feedLinkId },
    select: { workflow: { select: { ownerId: true } } },
  });
  return fl?.workflow.ownerId ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerId = await parentOwner(params.id);
  if (ownerId === null) return NextResponse.json({ error: "Feed link not found" }, { status: 404 });
  if (!isOwner({ ownerId }, session.user.id)) {
    return NextResponse.json({ error: "You can only edit feed links in your own workflows." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.fireIntervalSeconds === "number" && body.fireIntervalSeconds > 0) {
    data.fireIntervalSeconds = Math.round(body.fireIntervalSeconds);
  }
  if (typeof body.targetChannelId === "string" && body.targetChannelId) {
    data.targetChannelId = body.targetChannelId;
  }
  // Endpoint reconnection (BUG #10) — move the source to another feed node,
  // or the target to another task.
  if (typeof body.feedNodeId === "string" && body.feedNodeId) data.feedNodeId = body.feedNodeId;
  if (typeof body.targetTaskId === "string" && body.targetTaskId) data.targetTaskId = body.targetTaskId;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (typeof data.feedNodeId === "string" || typeof data.targetTaskId === "string") {
    const link = await prisma.feedLink.findUnique({ where: { id: params.id }, select: { workflowId: true } });
    if (typeof data.feedNodeId === "string") {
      const n = await prisma.feedNode.count({ where: { id: data.feedNodeId, workflowId: link?.workflowId } });
      if (n !== 1) return NextResponse.json({ error: "The feed node must be in the same workflow." }, { status: 400 });
    }
    if (typeof data.targetTaskId === "string") {
      const t = await prisma.task.count({ where: { id: data.targetTaskId, workflowId: link?.workflowId } });
      if (t !== 1) return NextResponse.json({ error: "The task must be in the same workflow." }, { status: 400 });
    }
  }

  const feedLink = await prisma.feedLink.update({ where: { id: params.id }, data });
  return NextResponse.json({ feedLink });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerId = await parentOwner(params.id);
  if (ownerId === null) return NextResponse.json({ error: "Feed link not found" }, { status: 404 });
  if (!isOwner({ ownerId }, session.user.id)) {
    return NextResponse.json({ error: "You can only delete feed links in your own workflows." }, { status: 403 });
  }

  await prisma.feedLink.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
