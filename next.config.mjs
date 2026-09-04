/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Baseline security response headers (security review 2026-09-04). No
  // Content-Security-Policy here on purpose — a strict CSP risks breaking
  // Google Sign-In's redirect flow and Next's own inline styles without a
  // proper nonce setup, and that's a careful pass of its own, not a cheap
  // addition. HSTS omits `preload` deliberately — submitting to the browser
  // preload list is effectively permanent and should be a deliberate choice,
  // not a side effect of a hardening pass.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
