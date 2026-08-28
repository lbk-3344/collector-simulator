export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildDeviceConfigData } from "@/lib/deviceConfig";

const WORKFLOW_SELECT = { id: true, name: true, status: true } as const;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const device = await prisma.device.findUnique({
    where: { id: params.id },
    include: { workflow: { select: WORKFLOW_SELECT } },
  });
  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  return NextResponse.json({ device });
}

// Two distinct shapes of update, per CLAUDE-CONCEPT.md section 15.4/15.5:
//  - Position-only (Overview map Edit-mode drag-to-reposition): only
//    positionX/positionY are touched, nothing else — "sans conséquences sur
//    sa configuration" (Luc's own words). Signaled by the absence of `name`.
//  - Full config save (the device config screen, BL-045): every field, sets
//    configured: true and auto-populates the single default Channel from
//    collectorId. Signaled by the presence of `name` — the config screen
//    always sends it, a position-only drag never does.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const isConfigSave = typeof body?.name === "string";

  const data = isConfigSave ? buildDeviceConfigData(body) : buildPositionData(body);
  if (!isConfigSave && Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const device = await prisma.device.update({
      where: { id: params.id },
      data,
      include: { workflow: { select: WORKFLOW_SELECT } },
    });
    return NextResponse.json({ device });
  } catch {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.device.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

function buildPositionData(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  if (typeof body.positionX === "number") data.positionX = body.positionX;
  if (typeof body.positionY === "number") data.positionY = body.positionY;
  return data;
}
