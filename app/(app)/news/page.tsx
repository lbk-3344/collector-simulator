import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// News feed (BL-075, CLAUDE-CONCEPT.md section 18) — every published
// announcement, newest first, for every signed-in approved user. Reached from
// the avatar menu (components/UserMenu.tsx). Authoring is admin-only and
// lives in Settings; reading is open to all.
function fmt(d: Date): string {
  return d.toLocaleString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default async function NewsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const announcements = await prisma.announcement.findMany({
    where: { publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    select: { id: true, title: true, body: true, imageData: true, publishedAt: true },
  });

  return (
    <section className="fade-in">
      <div className="settings-head">
        <h1>News</h1>
        <p>Announcements from the team, newest first.</p>
      </div>

      {announcements.length === 0 ? (
        <p className="note">No announcements yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 640 }}>
          {announcements.map((a) => (
            <article key={a.id} className="panel" style={{ padding: 20 }}>
              {a.imageData && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.imageData}
                  alt=""
                  style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 14, display: "block" }}
                />
              )}
              <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>{a.title}</h2>
              <p className="u-meta" style={{ margin: "0 0 12px" }}>
                {a.publishedAt ? fmt(a.publishedAt) : ""}
              </p>
              <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{a.body}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
