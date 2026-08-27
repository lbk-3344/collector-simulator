import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsTabs } from "./SettingsTabs";

// /settings is open to every signed-in user, tabbed — Bartender Connection is
// open to every role (including PENDING, see CLAUDE-CONCEPT.md section 7.1);
// Users and Bug Reports are admin-only, hidden entirely (not just disabled)
// for everyone else, per CLAUDE-CONCEPT.md section 4.
export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user.role === "ADMIN";

  const pendingCount = isAdmin ? await prisma.user.count({ where: { role: "PENDING" } }) : 0;
  const openBugCount = isAdmin ? await prisma.bugReport.count({ where: { status: "OPEN" } }) : 0;

  return (
    <section className="fade-in">
      <div className="settings-head">
        <h1>Settings</h1>
        <p>Reached from the avatar menu, not the left navigation — open to every signed-in user.</p>
      </div>

      <SettingsTabs
        isAdmin={isAdmin}
        pendingCount={pendingCount}
        openBugCount={openBugCount}
        currentUserId={session!.user.id}
      />
    </section>
  );
}
