export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail, announcementEmailHtml } from "@/lib/email";

// Publish an announcement (BL-075, §18). Admin-only, single-purpose action
// route (same shape as [id]/duplicate, [id]/share). Sets publishedAt if not
// already set, then — only if emailSentAt is still null — emails every
// USER/ADMIN once and stamps emailSentAt regardless of individual failures
// ("a failure surfaces, never blocks", as elsewhere in this app).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const announcement = await prisma.announcement.findUnique({ where: { id: params.id } });
  if (!announcement) {
    return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
  }

  const now = new Date();
  if (!announcement.publishedAt) {
    await prisma.announcement.update({ where: { id: params.id }, data: { publishedAt: now } });
  }

  if (announcement.emailSentAt) {
    return NextResponse.json({ published: true, emailed: 0, total: 0, alreadyEmailed: true });
  }

  const recipients = await prisma.user.findMany({
    where: { role: { in: ["USER", "ADMIN"] } },
    select: { email: true },
  });
  const html = announcementEmailHtml(announcement);
  const results = await Promise.allSettled(
    recipients.map((r) => sendEmail(r.email, announcement.title, html))
  );
  const emailed = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;

  await prisma.announcement.update({ where: { id: params.id }, data: { emailSentAt: new Date() } });

  return NextResponse.json({ published: true, emailed, total: recipients.length });
}
