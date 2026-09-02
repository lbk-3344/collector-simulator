import type { Metadata, Viewport } from "next";
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
//
// Favicon/PWA icon set added BL-077 (CHARTE-GRAPHIQUE.md "App icon / favicon"):
// an original mark (diagonal notch triangle + signal arcs), not the BarTender
// logo — see that section for why. Source SVGs + full size set live under
// public/icons/app/.
export const metadata: Metadata = {
  title: "Bartender Track and Trace Simulator",
  description:
    "Simulates Track & Trace infrastructure — Devices, Workflows, and Serialized Items — against the Bartender Track & Trace platform.",
  icons: {
    icon: [
      { url: "/icons/app/icon.svg", type: "image/svg+xml" },
      { url: "/icons/app/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/app/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icons/app/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0D1E2C",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
