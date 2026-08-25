export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Validate a PENDING user: default role USER, or ADMIN if the admin picks that
// directly from the Users tab (CLAUDE-CONCEPT.md section 4).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const role = body?.role === "ADMIN" ? "ADMIN" : "USER";

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target || target.role !== "PENDING") {
    return NextResponse.json({ error: "User not found or not pending" }, { status: 404 });
  }

  const updated = await prisma.user.update({ where: { id: params.id }, data: { role } });
  return NextResponse.json({ user: updated });
}
