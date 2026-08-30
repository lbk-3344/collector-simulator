export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  return data;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  try {
    const flowLink = await prisma.flowLink.update({ where: { id: params.id }, data: buildPatch(body) });
    return NextResponse.json({ flowLink });
  } catch {
    return NextResponse.json({ error: "Flow link not found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const link = await prisma.flowLink.findUnique({
    where: { id: params.id },
    select: { targetTaskId: true, targetChannelId: true },
  });
  if (!link) return NextResponse.json({ error: "Flow link not found" }, { status: 404 });

  await prisma.flowLink.delete({ where: { id: params.id } });

  // If nothing else feeds the target Channel now, reset its input to NONE.
  const stillFed = await prisma.flowLink.count({
    where: { targetTaskId: link.targetTaskId, targetChannelId: link.targetChannelId },
  });
  if (stillFed === 0) {
    await prisma.taskChannelInput
      .updateMany({
        where: { taskId: link.targetTaskId, channelId: link.targetChannelId, inputType: "FLOW_LINK" },
        data: { inputType: "NONE" },
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
