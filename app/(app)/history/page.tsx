import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { HistoryTabs } from "./HistoryTabs";

export const dynamic = "force-dynamic";

const HISTORY_INFO = (
  <>
    <p>
      Every outgoing Bartender API call this app makes on your behalf — the last 100, newest first, with the request
      and response so you can replay one as <code>curl</code>. Secrets are redacted before anything is stored.
    </p>
    <p>The EPCIS events tab shows the most recent events recorded on the platform for your locations.</p>
  </>
);

// History (BL-076/BL-076a, CLAUDE-CONCEPT.md section 19) — two tabs: this
// app's last 100 outgoing Bartender API calls (attributed to the caller),
// and the last 20 EPCIS events from the platform. Uses the shared PageHeader
// so its title matches the other left-nav pages (BUG #19).
export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <section className="fade-in">
      <PageHeader title="History" info={HISTORY_INFO} />
      <HistoryTabs />
    </section>
  );
}
