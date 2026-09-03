"use client";

import { useCallback, useEffect, useState } from "react";
import { UsersTable } from "./UsersTable";
import { BartenderConnectionTab } from "./BartenderConnectionTab";
import { BugReportsTable } from "./BugReportsTable";
import { AnnouncementsTab } from "./AnnouncementsTab";
import { SharedResourcesTable } from "@/components/SharedResourcesTable";

type Tab = "bartender" | "users" | "bugs" | "announcements" | "sharing";

const BADGE_POLL_MS = 8000;

// Bartender Connection is open to every role; Users, Bug Reports,
// Announcements and Shared resources only render for ADMIN (hidden entirely,
// not just disabled — see CLAUDE-CONCEPT.md section 4).
//
// The tab badge counts are seeded from SSR props, then kept live (BUG #16):
// SettingsTabs polls /api/settings/badges, and each admin table calls
// `refreshBadges` right after a mutation so a circle clears immediately
// rather than on the next navigation.
export function SettingsTabs({
  isAdmin,
  pendingCount,
  openBugCount,
  draftAnnouncementCount,
  currentUserId,
}: {
  isAdmin: boolean;
  pendingCount: number;
  openBugCount: number;
  draftAnnouncementCount: number;
  currentUserId: string;
}) {
  const [tab, setTab] = useState<Tab>("bartender");
  const [counts, setCounts] = useState({ pendingCount, openBugCount, draftAnnouncementCount });

  const refreshBadges = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/settings/badges", { cache: "no-store" });
      if (res.ok) setCounts(await res.json());
    } catch {
      /* keep the last known counts */
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const t = setInterval(refreshBadges, BADGE_POLL_MS);
    return () => clearInterval(t);
  }, [isAdmin, refreshBadges]);

  return (
    <>
      <div className="tabs">
        <button className={`tab${tab === "bartender" ? " active" : ""}`} onClick={() => setTab("bartender")}>
          Bartender Connection
        </button>
        {isAdmin && (
          <button className={`tab${tab === "users" ? " active" : ""}`} onClick={() => setTab("users")}>
            Users
            {counts.pendingCount > 0 && <span className="badge">{counts.pendingCount}</span>}
          </button>
        )}
        {isAdmin && (
          <button className={`tab${tab === "bugs" ? " active" : ""}`} onClick={() => setTab("bugs")}>
            Bug Reports
            {counts.openBugCount > 0 && <span className="badge">{counts.openBugCount}</span>}
          </button>
        )}
        {isAdmin && (
          <button
            className={`tab${tab === "announcements" ? " active" : ""}`}
            onClick={() => setTab("announcements")}
          >
            Announcements
            {counts.draftAnnouncementCount > 0 && <span className="badge">{counts.draftAnnouncementCount}</span>}
          </button>
        )}
        {isAdmin && (
          <button className={`tab${tab === "sharing" ? " active" : ""}`} onClick={() => setTab("sharing")}>
            Shared resources
          </button>
        )}
      </div>

      {tab === "bartender" && <BartenderConnectionTab />}
      {tab === "users" && isAdmin && <UsersTable currentUserId={currentUserId} onChanged={refreshBadges} />}
      {tab === "bugs" && isAdmin && <BugReportsTable onChanged={refreshBadges} />}
      {tab === "announcements" && isAdmin && <AnnouncementsTab onChanged={refreshBadges} />}
      {tab === "sharing" && isAdmin && <SharedResourcesTable />}
    </>
  );
}
