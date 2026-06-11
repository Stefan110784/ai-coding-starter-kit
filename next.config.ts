import type { NextConfig } from "next";

// Sicherheits-Header für alle Antworten (vgl. .claude/rules/security.md).
// Bewusst KEIN restriktives script-src in der CSP, um die Next.js-Inline-Runtime
// nicht zu brechen — eine vollständige CSP mit Nonce ist als Folgeschritt vorgesehen.
// `frame-ancestors 'none'` ergänzt X-Frame-Options als Clickjacking-Schutz.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // pdfjs-dist wird zur Laufzeit dynamisch geladen (Beleg-Import) und darf
  // nicht von Turbopack/Webpack gebündelt werden.
  serverExternalPackages: ["pdfjs-dist"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
