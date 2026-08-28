export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Minimal Workflow CRUD — see CLAUDE-CONCEPT.md section 15.2. Powers the
// device config screen's Workflow select (BL-045); no dedicated Workflow
// authoring UI exists yet (still BACKLOG.md section 6), so this is a plain
// signed-in-only surface, same as every other Bartender-adjacent route.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workflows = await prisma.workflow.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ workflows });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const status = body?.status === "STOPPED" ? "STOPPED" : "RUNNING";

  const workflow = await prisma.workflow.create({ data: { name, status } });
  return NextResponse.json({ workflow });
}
