export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TASK_INCLUDE = {
  device: { select: { id: true, name: true, type: true, locationCode: true, channels: true } },
  channelInputs: true,
  outgoingLinks: true,
  incomingLinks: true,
} as const;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const task = await prisma.task.findUnique({ where: { id: params.id }, include: TASK_INCLUDE });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ task });
}

// PATCH: name / canvas position, and/or a full replace of channelInputs
// (`channelInputs: [{ channelId, inputType, itemFeedId?, fireIntervalSeconds? }]`).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim() || null;
  if (typeof body.positionX === "number") data.positionX = Math.round(body.positionX);
  if (typeof body.positionY === "number") data.positionY = Math.round(body.positionY);

  const existing = await prisma.task.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const replaceInputs = Array.isArray(body.channelInputs);
  const inputRows = replaceInputs
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (body.channelInputs as any[])
        .filter((ci) => ci && typeof ci.channelId === "string" && ci.channelId)
        .map((ci) => ({
          taskId: params.id,
          channelId: ci.channelId,
          inputType:
            ci.inputType === "ITEM_FEED" || ci.inputType === "FLOW_LINK" ? ci.inputType : "NONE",
          itemFeedId: typeof ci.itemFeedId === "string" && ci.itemFeedId ? ci.itemFeedId : null,
          fireIntervalSeconds:
            typeof ci.fireIntervalSeconds === "number" && ci.fireIntervalSeconds > 0
              ? Math.round(ci.fireIntervalSeconds)
              : null,
        }))
    : [];

  await prisma.$transaction([
    prisma.task.update({ where: { id: params.id }, data }),
    ...(replaceInputs
      ? [
          prisma.taskChannelInput.deleteMany({ where: { taskId: params.id } }),
          ...(inputRows.length ? [prisma.taskChannelInput.createMany({ data: inputRows })] : []),
        ]
      : []),
  ]);

  const task = await prisma.task.findUnique({ where: { id: params.id }, include: TASK_INCLUDE });
  return NextResponse.json({ task });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await prisma.task.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
