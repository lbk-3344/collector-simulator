export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getNeonUsage, getResendUsage, getVercelUsage, getCronJobOrgUsage } from "@/lib/resourceUsage";

// Admin-only — the Consumption tab itself is hidden entirely for non-admins
// (see SettingsTabs.tsx), and this route enforces the same gate server-side,
// same pattern as GET /api/users. Fetched on demand (tab open / manual
// refresh) — not polled, nothing stored.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [neon, resend, vercel, cronJobOrg] = await Promise.all([
    getNeonUsage(),
    getResendUsage(),
    getVercelUsage(),
    getCronJobOrgUsage(),
  ]);

  return NextResponse.json({ neon, resend, vercel, cronJobOrg });
}
