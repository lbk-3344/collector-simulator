export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateImageData } from "@/lib/announcement";

// Announcements (BL-075, CLAUDE-CONCEPT.md section 18). One role-branched GET:
// admins get every announcement (draft + published) for the authoring tab;
// everyone else gets only published ones for the News page. POST is
// admin-only and always creates a draft.

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "PENDING") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const announcements = await prisma.announcement.findMany({
    where: isAdmin ? {} : { publishedAt: { not: null } },
    orderBy: isAdmin ? { createdAt: "desc" } : { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      body: true,
      imageData: true,
      publishedAt: true,
      emailSentAt: true,
      createdAt: true,
      author: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({ announcements });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!title || !text) {
    return NextResponse.json({ error: "Title and body are required." }, { status: 400 });
  }

  const image = validateImageData(body?.imageData);
  if (!image.ok) return NextResponse.json({ error: image.error }, { status: 400 });

  const announcement = await prisma.announcement.create({
    data: { title, body: text, imageData: image.value, authorId: session.user.id },
  });
  return NextResponse.json({ announcement }, { status: 201 });
}
