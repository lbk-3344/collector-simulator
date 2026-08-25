import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

// Wraps every authenticated route with the sidebar/topbar/avatar-menu shell,
// ported from mockup-app-shell.html. Middleware already guarantees a signed-in,
// non-PENDING user by the time we get here — the checks below are a defensive
// fallback, not the primary gate.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "PENDING") redirect("/auth/pending");

  return (
    <AppShell
      user={{
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
        role: session.user.role,
      }}
    >
      {children}
    </AppShell>
  );
}
