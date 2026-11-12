import type { NextConfig } from "next";

// Cabeçalhos de segurança (spec 10.2, US-8.1). A CSP fica sem nonce: com nonce toda página
// vira dinâmica e o prerender parcial (cacheComponents) deixa de valer. Por isso os scripts
// inline do Next (payload do RSC) entram por 'unsafe-inline'; o React já escapa o texto e o
// lint proíbe dangerouslySetInnerHTML. O Supabase entra em connect-src (login no navegador).
const isDev = process.env.NODE_ENV !== "production";

function supabaseOrigins(): string[] {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];
  const { origin, host } = new URL(url);
  return [origin, `wss://${host}`];
}

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src ${["'self'", ...supabaseOrigins(), ...(isDev ? ["ws:"] : [])].join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
