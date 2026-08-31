"use client";

import { useState } from "react";
import { UsersTable } from "./UsersTable";
import { BartenderConnectionTab } from "./BartenderConnectionTab";
import { BugReportsTable } from "./BugReportsTable";
import { SharedResourcesTable } from "@/components/SharedResourcesTable";

type Tab = "bartender" | "users" | "bugs" | "sharing";

// Bartender Connection is open to every role; Users and Bug Reports only
// render for ADMIN (hidden entirely, not just disabled — see
// CLAUDE-CONCEPT.md section 4).
export function SettingsTabs({
  isAdmin,
  pendingCount,
  openBugCount,
  currentUserId,
}: {
  isAdmin: boolean;
  pendingCount: number;
  openBugCount: number;
  currentUserId: string;
}) {
  const [tab, setTab] = useState<Tab>("bartender");

  return (
    <>
      <div className="tabs">
        <button className={`tab${tab === "bartender" ? " active" : ""}`} onClick={() => setTab("bartender")}>
          Bartender Connection
        </button>
        {isAdmin && (
          <button className={`tab${tab === "users" ? " active" : ""}`} onClick={() => setTab("users")}>
            Users
            {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          </button>
        )}
        {isAdmin && (
          <button className={`tab${tab === "bugs" ? " active" : ""}`} onClick={() => setTab("bugs")}>
            Bug Reports
            {openBugCount > 0 && <span className="badge">{openBugCount}</span>}
          </button>
        )}
        {isAdmin && (
          <button className={`tab${tab === "sharing" ? " active" : ""}`} onClick={() => setTab("sharing")}>
            Shared resources
          </button>
        )}
      </div>

      {tab === "bartender" && <BartenderConnectionTab />}
      {tab === "users" && isAdmin && <UsersTable currentUserId={currentUserId} />}
      {tab === "bugs" && isAdmin && <BugReportsTable />}
      {tab === "sharing" && isAdmin && <SharedResourcesTable />}
    </>
  );
}
