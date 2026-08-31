export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwner } from "@/lib/ownership";

// Ownership inherited from the parent Workflow (BL-067, §17.1).
async function parentOwner(feedNodeId: string) {
  const fn = await prisma.feedNode.findUnique({
    where: { id: feedNodeId },
    select: { workflow: { select: { ownerId: true } } },
  });
  return fn?.workflow.ownerId ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerId = await parentOwner(params.id);
  if (ownerId === null) return NextResponse.json({ error: "Feed node not found" }, { status: 404 });
  if (!isOwner({ ownerId }, session.user.id)) {
    return NextResponse.json({ error: "You can only edit feed nodes in your own workflows." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.positionX === "number") data.positionX = Math.round(body.positionX);
  if (typeof body.positionY === "number") data.positionY = Math.round(body.positionY);
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const feedNode = await prisma.feedNode.update({ where: { id: params.id }, data });
  return NextResponse.json({ feedNode });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerId = await parentOwner(params.id);
  if (ownerId === null) return NextResponse.json({ error: "Feed node not found" }, { status: 404 });
  if (!isOwner({ ownerId }, session.user.id)) {
    return NextResponse.json({ error: "You can only delete feed nodes in your own workflows." }, { status: 403 });
  }

  await prisma.feedNode.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
