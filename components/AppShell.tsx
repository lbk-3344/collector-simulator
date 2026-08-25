"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import { UserMenu, type ShellUser } from "@/components/UserMenu";
import { BugReportModal } from "@/components/BugReportModal";

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

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/devices": "Devices",
  "/workflows": "Workflows",
  "/items": "Serialized Items",
  "/settings": "Settings",
};

function pageTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const base = "/" + pathname.split("/")[1];
  return TITLES[base] ?? "Bartender Track and Trace Simulator";
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [bugModalOpen, setBugModalOpen] = useState(false);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-brand">
          <Image src="/brand/bartender-logo.png" alt="BarTender" width={26} height={21} style={{ objectFit: "contain" }} priority />
          <div className="side-brand-text">
            <span className="side-brand-word">
              BarTender<span>.</span>
            </span>
            <span className="side-brand-tag">Track &amp; Trace Sim.</span>
          </div>
        </div>
        <nav className="side-nav">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={`side-link${pathname === item.href ? " active" : ""}`}>
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="side-foot">v0.1.0 &middot; staging</div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="topbar-title">{pageTitle(pathname)}</div>
          <div className="topbar-right">
            <UserMenu user={user} onReportBug={() => setBugModalOpen(true)} />
          </div>
        </header>

        <main className="content">{children}</main>
      </div>

      <BugReportModal open={bugModalOpen} onClose={() => setBugModalOpen(false)} />
    </div>
  );
}
