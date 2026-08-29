import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OverviewClient } from "./OverviewClient";

// Site selection, location map, and KPI cards — see CLAUDE-CONCEPT.md
// section 14, BACKLOG.md BL-036 to BL-039. The interactive parts live in
// OverviewClient; this server component just resolves the signed-in user's
// previously-selected site (if any) to pass down as the starting value.
export default async function OverviewPage() {
  const session = await getServerSession(authOptions);
  const user = session
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { selectedLocationCode: true },
      })
    : null;

  return (
    <section className="fade-in overview-page">
      <h1 className="page-title">Overview</h1>
      <OverviewClient initialSelectedLocationCode={user?.selectedLocationCode ?? null} />
    </section>
  );
}
