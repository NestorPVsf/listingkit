import type { NextConfig } from "next";

/**
 * Headers de seguridad razonables para app interna (paso 6.4 del PLAN.md).
 * Nada de CSP forzada: el renderer Playwright (lib/infrastructure/render/
 * playwright-renderer.ts) navega a /preview/[pieceId] same-origin, y ese
 * layout usa <link> a Google Fonts + estilos inline por plantilla (ver
 * app/preview/layout.tsx) — una CSP estricta sin auditar cada plantilla
 * podria romper el render sin avisar. Decision documentada en
 * docs/stack-decisions.md en vez de forzar CSP a ciegas.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // SAMEORIGIN, no DENY: el preview de PDF se embebe en iframe same-origin.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
