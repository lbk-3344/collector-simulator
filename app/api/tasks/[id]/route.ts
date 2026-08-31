export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwner, visibilityWhere } from "@/lib/ownership";

const TASK_INCLUDE = {
  device: { select: { id: true, name: true, type: true, locationCode: true, channels: true } },
  incomingFeedLinks: true,
  outgoingFlowLinks: true,
  incomingFlowLinks: true,
} as const;

// Ownership/visibility for a Task is its parent Workflow's (BL-067).
async function parentOwner(taskId: string) {
  const t = await prisma.task.findUnique({ where: { id: taskId }, select: { workflow: { select: { ownerId: true } } } });
  return t?.workflow.ownerId ?? null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const task = await prisma.task.findFirst({
    where: { id: params.id, workflow: visibilityWhere(session.user.id) },
    include: TASK_INCLUDE,
  });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ task });
}

// PATCH: name / canvas position only. A Channel's inputs are FeedLinks /
// FlowLinks now (BL-059 revised) — managed through their own routes.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerId = await parentOwner(params.id);
  if (ownerId === null) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (!isOwner({ ownerId }, session.user.id)) {
    return NextResponse.json({ error: "You can only edit tasks in your own workflows." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim() || null;
  if (typeof body.positionX === "number") data.positionX = Math.round(body.positionX);
  if (typeof body.positionY === "number") data.positionY = Math.round(body.positionY);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const task = await prisma.task.update({ where: { id: params.id }, data, include: TASK_INCLUDE });
    return NextResponse.json({ task });
  } catch {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerId = await parentOwner(params.id);
  if (ownerId === null) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (!isOwner({ ownerId }, session.user.id)) {
    return NextResponse.json({ error: "You can only delete tasks in your own workflows." }, { status: 403 });
  }

  await prisma.task.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
