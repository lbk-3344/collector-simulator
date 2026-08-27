"use client";

import { useState } from "react";
import { UsersTable } from "./UsersTable";
import { BartenderConnectionTab } from "./BartenderConnectionTab";

type Tab = "bartender" | "users";

// Bartender Connection is open to every role; Users only renders for ADMIN
// (hidden entirely, not just disabled — see CLAUDE-CONCEPT.md section 4).
export function SettingsTabs({
  isAdmin,
  pendingCount,
  currentUserId,
}: {
  isAdmin: boolean;
  pendingCount: number;
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
      </div>

      {tab === "bartender" && <BartenderConnectionTab />}
      {tab === "users" && isAdmin && <UsersTable currentUserId={currentUserId} />}
    </>
  );
}
