export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateImageData } from "@/lib/announcement";

// Edit / delete a single announcement (BL-075, §18). Admin-only. PATCH never
// touches publishedAt / emailSentAt — editing an already-published one
// re-triggers nothing (mirrors the Device Save vs. Publish split, §15.4).

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const data: { title?: string; body?: string; imageData?: string | null } = {};

  if (body?.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "Title can't be empty." }, { status: 400 });
    data.title = title;
  }
  if (body?.body !== undefined) {
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) return NextResponse.json({ error: "Body can't be empty." }, { status: 400 });
    data.body = text;
  }
  if (body?.imageData !== undefined) {
    const image = validateImageData(body.imageData);
    if (!image.ok) return NextResponse.json({ error: image.error }, { status: 400 });
    data.imageData = image.value;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const announcement = await prisma.announcement.update({ where: { id: params.id }, data });
    return NextResponse.json({ announcement });
  } catch {
    return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    await prisma.announcement.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
  }
}
