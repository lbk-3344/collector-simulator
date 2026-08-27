import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";

// Inter + JetBrains Mono, self-hosted via @fontsource (see CHARTE-GRAPHIQUE.md
// "Typography", BL-030) rather than next/font/google or a Google Fonts CDN
// link — zero external font requests in production, and the fonts show up as
// real package.json dependencies once this repo is linked to Claude Design.
export const metadata: Metadata = {
  title: "Bartender Track and Trace Simulator",
  description:
    "Simulates Track & Trace infrastructure — Devices, Workflows, and Serialized Items — against the Bartender Track & Trace platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
