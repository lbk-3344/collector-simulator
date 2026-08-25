import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UsersTable } from "./UsersTable";

// /settings is open to every signed-in user, tabbed. Right now the only tab is
// Users, and it's admin-only — hidden entirely (not just disabled) for USER,
// per CLAUDE-CONCEPT.md section 4. Other tabs will show up here as the app grows.
export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = session?.user.role === "ADMIN";

  const pendingCount = isAdmin ? await prisma.user.count({ where: { role: "PENDING" } }) : 0;

  return (
    <section className="fade-in">
      <div className="settings-head">
        <h1>Settings</h1>
        <p>Reached from the avatar menu, not the left navigation — open to every signed-in user.</p>
      </div>

      {isAdmin ? (
        <>
          <div className="tabs">
            <button className="tab active">
              Users
              {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
            </button>
          </div>
          <UsersTable currentUserId={session!.user.id} />
        </>
      ) : (
        <div className="placeholder">
          <span className="tag">Settings</span>
          <h2>Nothing here yet</h2>
          <p>There&apos;s nothing to configure here right now — check back as the app grows.</p>
        </div>
      )}
    </section>
  );
}
