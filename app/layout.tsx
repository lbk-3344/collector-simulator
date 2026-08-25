import type { Metadata } from "next";
import "./globals.css";

// next/font/google downloads font files at build time, which isn't reachable
// from every build environment (this repo's own sandboxed build included) —
// falling back to a plain Google Fonts stylesheet link, same approach as
// style-guide.html / mockup-app-shell.html, per CLAUDE.md guidance.
export const metadata: Metadata = {
  title: "Bartender Track and Trace Simulator",
  description:
    "Simulates Track & Trace infrastructure — Devices, Workflows, and Serialized Items — against the Bartender Track & Trace platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
