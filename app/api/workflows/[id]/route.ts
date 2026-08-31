export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const WORKFLOW_INCLUDE = {
  tasks: {
    include: {
      device: { select: { id: true, name: true, type: true, collectorId: true, channels: true } },
    },
  },
  feedNodes: {
    include: { itemFeed: { select: { id: true, name: true, kind: true, gtins: true, presentMatchMode: true } } },
  },
  feedLinks: true,
  flowLinks: true,
} as const;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workflow = await prisma.workflow.findUnique({ where: { id: params.id }, include: WORKFLOW_INCLUDE });
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  return NextResponse.json({ workflow });
}

// PATCH: rename, edit maxRunDurationMinutes, and Run/Stop.
//  - flip to RUNNING  → set runningStartedAt = now, clear autoStoppedAt
//  - flip to STOPPED (by a user) → clear runningStartedAt
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (
    typeof body.maxRunDurationMinutes === "number" &&
    Number.isFinite(body.maxRunDurationMinutes) &&
    body.maxRunDurationMinutes > 0
  ) {
    data.maxRunDurationMinutes = Math.round(body.maxRunDurationMinutes);
  }
  if (body.status === "RUNNING" || body.status === "STOPPED") {
    data.status = body.status;
    if (body.status === "RUNNING") {
      data.runningStartedAt = new Date();
      data.autoStoppedAt = null;
    } else {
      data.runningStartedAt = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const workflow = await prisma.workflow.update({ where: { id: params.id }, data, include: WORKFLOW_INCLUDE });
    return NextResponse.json({ workflow });
  } catch {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await prisma.workflow.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
