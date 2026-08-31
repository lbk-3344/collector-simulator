export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visibilityWhere } from "@/lib/ownership";

// Task CRUD (BL-059) — a Device doing work in a Workflow. Visibility and
// ownership are inherited from the parent Workflow (BL-067, §17.1/§17.3).

const TASK_INCLUDE = {
  device: { select: { id: true, name: true, type: true, locationCode: true, channels: true } },
  incomingFeedLinks: true,
} as const;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workflowId = req.nextUrl.searchParams.get("workflowId");
  // Visibility via the parent Workflow — owned-or-shared (BL-067).
  const tasks = await prisma.task.findMany({
    where: {
      workflow: visibilityWhere(session.user.id),
      ...(workflowId ? { workflowId } : {}),
    },
    include: TASK_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const workflowId = typeof body?.workflowId === "string" ? body.workflowId : "";
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : "";
  if (!workflowId || !deviceId) {
    return NextResponse.json({ error: "workflowId and deviceId are required" }, { status: 400 });
  }

  const [workflow, device] = await Promise.all([
    prisma.workflow.findUnique({ where: { id: workflowId }, select: { id: true, ownerId: true } }),
    prisma.device.findUnique({ where: { id: deviceId }, select: { id: true, name: true, ownerId: true } }),
  ]);
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  // A Task may only wire a Device into a Workflow when the caller owns BOTH
  // (BL-067, §17.3). Sharing grants read-only visibility of a thing, not the
  // right to compose it into someone else's graph — clone it first (BL-065).
  if (workflow.ownerId !== session.user.id) {
    return NextResponse.json({ error: "You can only add tasks to your own workflows." }, { status: 403 });
  }
  if (device.ownerId !== session.user.id) {
    return NextResponse.json({ error: "You can only attach your own devices." }, { status: 403 });
  }
  if (workflow.ownerId !== device.ownerId) {
    return NextResponse.json({ error: "Devices and workflows must belong to the same owner." }, { status: 403 });
  }

  try {
    const task = await prisma.task.create({
      data: {
        workflowId,
        deviceId,
        name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : device.name,
        positionX: typeof body.positionX === "number" ? Math.round(body.positionX) : null,
        positionY: typeof body.positionY === "number" ? Math.round(body.positionY) : null,
      },
      include: TASK_INCLUDE,
    });
    return NextResponse.json({ task });
  } catch {
    // @unique(deviceId) — the Device is already on another Task.
    return NextResponse.json(
      { error: "That device is already attached to a workflow. Remove it there first." },
      { status: 409 }
    );
  }
}
