"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Image from "next/image";

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.96H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.04l3.01-2.34z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.96l3.01 2.34C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

function LoginCard() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const error = searchParams.get("error");

  return (
    <div className="auth-card fade-in">
      <div className="auth-logo">
        <Image src="/brand/bartender-logo.png" alt="BarTender" width={34} height={27} style={{ objectFit: "contain" }} priority />
        <span className="auth-logo-word">
          BarTender<span>.</span>
        </span>
      </div>
      <h1 className="auth-title">Track &amp; Trace Simulator</h1>
      <p className="auth-sub">Sign in with your work Google account to continue.</p>

      {error && (
        <div className="snack snack-danger" style={{ textAlign: "left" }}>
          Sign-in failed. Please try again, or contact an admin if this keeps happening.
        </div>
      )}

      <button className="google-btn" onClick={() => signIn("google", { callbackUrl })}>
        <GoogleIcon />
        Sign in with Google
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <Suspense fallback={<div className="auth-card" />}>
        <LoginCard />
      </Suspense>
    </main>
  );
}
