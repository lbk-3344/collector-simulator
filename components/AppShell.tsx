"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import { UserMenu, type ShellUser } from "@/components/UserMenu";
import { BugReportModal } from "@/components/BugReportModal";
import { AppDialogProvider } from "@/components/AppDialog";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Overview",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" strokeWidth="1.6">
        <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.4" />
        <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.4" />
        <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.4" />
        <rect x="11" y="11" width="6.5" height="6.5" rx="1.4" />
      </svg>
    ),
  },
  {
    href: "/devices",
    label: "Devices",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" strokeWidth="1.6">
        <rect x="5" y="5" width="10" height="10" rx="1.6" />
        <line x1="5" y1="8.2" x2="2.3" y2="8.2" />
        <line x1="5" y1="11.8" x2="2.3" y2="11.8" />
        <line x1="15" y1="8.2" x2="17.7" y2="8.2" />
        <line x1="15" y1="11.8" x2="17.7" y2="11.8" />
        <line x1="8.2" y1="5" x2="8.2" y2="2.3" />
        <line x1="11.8" y1="5" x2="11.8" y2="2.3" />
        <line x1="8.2" y1="15" x2="8.2" y2="17.7" />
        <line x1="11.8" y1="15" x2="11.8" y2="17.7" />
      </svg>
    ),
  },
  {
    href: "/workflows",
    label: "Workflows",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" strokeWidth="1.6">
        <circle cx="3.2" cy="10" r="1.9" />
        <circle cx="10" cy="4.5" r="1.9" />
        <circle cx="10" cy="15.5" r="1.9" />
        <circle cx="16.8" cy="10" r="1.9" />
        <line x1="5" y1="9" x2="8.3" y2="5.6" />
        <line x1="5" y1="11" x2="8.3" y2="14.4" />
        <line x1="11.7" y1="5.6" x2="15" y2="9" />
        <line x1="11.7" y1="14.4" x2="15" y2="11" />
      </svg>
    ),
  },
  {
    href: "/item-feeds",
    label: "Item Feeds",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M10 2.6 17.4 6 10 9.4 2.6 6 10 2.6Z" />
        <path d="M2.6 10 10 13.4 17.4 10" />
        <path d="M2.6 14 10 17.4 17.4 14" />
      </svg>
    ),
  },
  {
    href: "/items",
    label: "Serialized Items",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" strokeWidth="1.6">
        <polygon points="2.5,7 8.5,2.5 17.5,2.5 17.5,11.5 8.5,17.5" />
        <circle cx="13" cy="6.2" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

export function AppShell({
  user,
  version,
  environment,
  children,
}: {
  user: ShellUser;
  version: string;
  environment: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <AppDialogProvider>
    <div className="app">
      <header className="topbar">
        <div className="side-brand">
          <Image src="/brand/bartender-logo.png" alt="BarTender" width={26} height={21} style={{ objectFit: "contain" }} priority />
          <div className="side-brand-text">
            <span className="side-brand-word">
              BarTender<span>.</span>
            </span>
            <span className="side-brand-tag">Track &amp; Trace Simulator</span>
          </div>
        </div>
        <div className="topbar-right">
          <UserMenu user={user} onReportBug={() => setBugModalOpen(true)} />
        </div>
      </header>

      <div className="shell-body">
        <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
          <nav className="side-nav">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`side-link${pathname === item.href ? " active" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                {item.icon}
                {!collapsed && item.label}
              </Link>
            ))}
          </nav>

          <button
            className="side-toggle"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <polyline points="12,4 6,10 12,16" />
              <polyline points="16,4 10,10 16,16" />
            </svg>
          </button>

          {!collapsed && (
            <div className="side-foot">
              v{version}
              {environment && <> &middot; {environment}</>}
            </div>
          )}
        </aside>

        <main className="content">{children}</main>
      </div>

      <BugReportModal open={bugModalOpen} onClose={() => setBugModalOpen(false)} />
    </div>
    </AppDialogProvider>
  );
}
