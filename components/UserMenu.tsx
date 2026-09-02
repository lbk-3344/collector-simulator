"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

export type ShellUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: "ADMIN" | "USER" | "PENDING";
};

function initials(user: ShellUser): string {
  const source = user.name ?? user.email ?? "?";
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

const ROLE_LABEL: Record<ShellUser["role"], string> = {
  ADMIN: "Admin",
  USER: "User",
  PENDING: "Pending",
};

// Avatar button + dropdown: identity block, Settings, News (published
// announcements, BL-075), Report a bug (opens the modal without navigating
// away), Sign out. See CLAUDE-CONCEPT.md section 4 "Navigation" — this menu is
// the only entry point to Settings, News, and bug reporting.
export function UserMenu({ user, onReportBug }: { user: ShellUser; onReportBug: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const displayName = user.name ?? user.email ?? "Account";

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button className="user-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="user-avatar">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            initials(user)
          )}
        </span>
        <span className="user-btn-name">{displayName}</span>
        <svg className="chev" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <polyline points="5,7.5 10,12.5 15,7.5" />
        </svg>
      </button>

      <div className={`user-menu${open ? " open" : ""}`}>
        <div className="user-menu-head">
          <span className="user-menu-avatar">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              initials(user)
            )}
          </span>
          <div className="user-menu-id">
            <div className="user-menu-name">{displayName}</div>
            <div className="user-menu-email">{user.email}</div>
            <span className="user-menu-role">{ROLE_LABEL[user.role]}</span>
          </div>
        </div>

        <div className="user-menu-items">
          <Link href="/settings" className="user-menu-item" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <line x1="3" y1="6" x2="17" y2="6" />
              <circle cx="12.5" cy="6" r="1.8" fill="var(--surface)" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <circle cx="7" cy="10" r="1.8" fill="var(--surface)" />
              <line x1="3" y1="14" x2="17" y2="14" />
              <circle cx="13.5" cy="14" r="1.8" fill="var(--surface)" />
            </svg>
            Settings
          </Link>
          <Link href="/news" className="user-menu-item" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h3l6-4v12l-6-4H4z" />
              <path d="M13 8.5a2.5 2.5 0 0 1 0 3" />
            </svg>
            News
          </Link>
          <button
            className="user-menu-item"
            onClick={() => {
              setOpen(false);
              onReportBug();
            }}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <ellipse cx="10" cy="11.5" rx="4.4" ry="5.2" />
              <line x1="10" y1="6.6" x2="10" y2="4.2" />
              <line x1="7.6" y1="5.6" x2="6.5" y2="4" />
              <line x1="12.4" y1="5.6" x2="13.5" y2="4" />
              <line x1="5.7" y1="9.5" x2="3" y2="8.6" />
              <line x1="5.7" y1="13.2" x2="3" y2="14.3" />
              <line x1="14.3" y1="9.5" x2="17" y2="8.6" />
              <line x1="14.3" y1="13.2" x2="17" y2="14.3" />
            </svg>
            Report a bug
          </button>
          <div className="user-menu-sep" />
          <button className="user-menu-item danger" onClick={() => signOut({ callbackUrl: "/login" })}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M8 3H4.5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1H8" strokeLinecap="round" />
              <polyline points="12.5,6.5 16,10 12.5,13.5" />
              <line x1="16" y1="10" x2="7" y2="10" />
            </svg>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
