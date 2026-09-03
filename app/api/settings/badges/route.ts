export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Live counts for the Settings tab badges (BUG #16) — polled by SettingsTabs
// so the red circles clear on their own once every pending user is validated,
// every announcement published, every bug resolved (or another admin does it
// in parallel). Admin-only; same three numbers settings/page.tsx computes at
// SSR time.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const [pendingCount, openBugCount, draftAnnouncementCount] = await Promise.all([
    prisma.user.count({ where: { role: "PENDING" } }),
    prisma.bugReport.count({ where: { status: "OPEN" } }),
    prisma.announcement.count({ where: { publishedAt: null } }),
  ]);

  return NextResponse.json({ pendingCount, openBugCount, draftAnnouncementCount });
}
