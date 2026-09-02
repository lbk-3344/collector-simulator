"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import Image from "next/image";

// Polls NextAuth's own /api/auth/session every 30s and leaves once an admin
// validates the account (role no longer PENDING) — same pattern as Supplier
// Connect's PendingPage.tsx. See CLAUDE-CONCEPT.md section 4.
//
// Deliberately NOT a plain "read the current role" endpoint: middleware.ts
// checks the role via next-auth/jwt's getToken(), which only decodes the
// existing signed session cookie — it never re-runs the jwt callback, so it
// can't see a role change made in the DB. NextAuth's built-in session route
// is the one call that both re-runs jwt() (via getServerSession) AND re-signs
// the session cookie, so middleware's next check actually sees the new role.
// A route that only reads fresh data without touching the cookie would report
// the correct role here but still bounce the user right back to this page on
// the next navigation or refresh.
export default function PendingPage() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch("/api/auth/session", { cache: "no-store" }).catch(() => null);
      if (!res) return;
      const data = await res.json().catch(() => null);
      if (data?.user?.role && data.user.role !== "PENDING") {
        router.push("/");
        router.refresh();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [router]);

  return (
    <main className="auth-shell">
      <div className="auth-card fade-in">
        <div className="auth-logo">
          {/* App mark (BL-077) — an original design, not the BarTender logo. */}
          <Image src="/brand/app-icon.png" alt="" width={30} height={30} style={{ objectFit: "contain" }} priority />
          <span className="auth-logo-word">
            BarTender<span>.</span>
          </span>
        </div>

        <div className="pending-icon-wrap">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width="26" height="26">
            <circle cx="10" cy="10" r="7.5" />
            <polyline points="10,5.5 10,10 13,12" />
          </svg>
        </div>

        <h1 className="auth-title">Account pending approval</h1>
        <p className="auth-sub" style={{ marginBottom: 4 }}>
          Your account has been created but is waiting for an administrator to grant you access.
        </p>

        <div className="pending-note">
          This page checks automatically every 30 seconds — no need to refresh. Once approved,
          you&apos;ll be taken straight into the app.
        </div>

        <button className="auth-foot-link" onClick={() => signOut({ callbackUrl: "/login" })}>
          Sign out
        </button>
      </div>
    </main>
  );
}
