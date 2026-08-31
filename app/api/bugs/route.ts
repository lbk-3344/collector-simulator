export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// See CLAUDE-CONCEPT.md section 3 — bug reporting, built P0. Screenshot upload
// (Cloudinary) is a later backlog item (BL-008); screenshotUrl is accepted here
// so the field is wired end-to-end once that lands, but the modal doesn't send one yet.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";

  if (!title || !description) {
    return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
  }

  const bug = await prisma.bugReport.create({
    data: {
      title,
      description,
      reporterId: session.user.id,
      screenshotUrl: typeof body?.screenshotUrl === "string" ? body.screenshotUrl : null,
    },
  });

  return NextResponse.json({ bug }, { status: 201 });
}

// Admin-only — powers the Bug Reports tab in Settings. BUGS.md export (BL-009)
// reads from the DB directly via its own script, not this route.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bugs = await prisma.bugReport.findMany({
    where: { status: "OPEN" },
    orderBy: { reportedAt: "desc" },
    select: {
      id: true,
      number: true,
      title: true,
      description: true,
      screenshotUrl: true,
      reportedAt: true,
      reporter: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({ bugs });
}
