export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.positionX === "number") data.positionX = Math.round(body.positionX);
  if (typeof body.positionY === "number") data.positionY = Math.round(body.positionY);
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const feedNode = await prisma.feedNode.update({ where: { id: params.id }, data });
    return NextResponse.json({ feedNode });
  } catch {
    return NextResponse.json({ error: "Feed node not found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await prisma.feedNode.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Feed node not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
