import type { NextConfig } from "next"

/**
 * Sicherheits-Header.
 *
 * Das Cockpit verarbeitet später Shopify-Webhooks und Supabase-Sitzungen.
 * Besonders `frame-ancestors 'none'` zählt: Verkaufen, Deaktivieren und
 * Zurücksetzen sind Ein-Klick-Aktionen und wären in einem fremden Rahmen
 * angreifbar.
 *
 * Die Inhaltsrichtlinie läuft zunächst nur im Meldemodus. Zwei Gründe:
 * `img-src` muss `data:` erlauben (Produktbilder und Platzhalter liegen als
 * Data-URL vor), und `style-src` braucht bis zur Serverumstellung
 * `'unsafe-inline'` wegen next/font. Erst wenn die Meldungen sauber sind,
 * wird daraus ein durchgesetzter Header.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self'",
].join("; ")

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          { key: "Content-Security-Policy-Report-Only", value: CSP },
        ],
      },
    ]
  },
}

export default nextConfig
