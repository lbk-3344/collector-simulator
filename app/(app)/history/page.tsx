import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { HistoryTabs } from "./HistoryTabs";

export const dynamic = "force-dynamic";

// History (BL-076/BL-076a, CLAUDE-CONCEPT.md section 19) — two tabs: this
// app's last 100 outgoing Bartender API calls (attributed to the caller),
// and the last 20 EPCIS events from the platform.
export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <section className="fade-in">
      <div className="settings-head">
        <h1>History</h1>
        <p>Bartender API calls made on your behalf, and recent EPCIS events from the platform.</p>
      </div>
      <HistoryTabs />
    </section>
  );
}
