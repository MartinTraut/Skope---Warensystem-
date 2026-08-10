/**
 * Erzeugt Platzhalterbilder als SVG-Data-URL.
 *
 * Der Prototyp soll ohne Bildmaterial auskommen, aber auch keine kaputten
 * Bild-Kacheln zeigen. Die Platzhalter sind bewusst als solche erkennbar und
 * verwenden die Brand-Farben. Sobald Supabase Storage angebunden ist, liefert
 * `ScooterImage.url` echte URLs — der Rest der Anwendung bleibt unverändert.
 */

const VIEW_LABELS = [
  "Frontansicht",
  "Seitenansicht",
  "Detail Display",
  "Detail Bremse",
  "Rückansicht",
  "Faltmechanismus",
] as const

export function placeholderViewLabel(index: number): string {
  return VIEW_LABELS[index % VIEW_LABELS.length]
}

/**
 * @param label Modellbezeichnung, wird im Bild angezeigt.
 * @param view  Bildunterschrift (z. B. "Seitenansicht").
 * @param seed  Sorgt für leicht unterschiedliche Neigung/Helligkeit je Bild.
 */
export function createPlaceholderImage(
  label: string,
  view: string,
  seed: number
): string {
  const tilt = -8 + (seed % 5) * 4
  const glow = 0.05 + (seed % 4) * 0.02

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#141619"/>
      <stop offset="100%" stop-color="#0b0c0e"/>
    </linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c8a45a"/>
      <stop offset="55%" stop-color="#8d8f95"/>
      <stop offset="100%" stop-color="#4a4f57"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="55%">
      <stop offset="0%" stop-color="#c8a45a" stop-opacity="${glow}"/>
      <stop offset="100%" stop-color="#c8a45a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <rect width="800" height="600" fill="url(#glow)"/>
  <g transform="translate(400 300) rotate(${tilt}) translate(-400 -300)" opacity="0.9">
    <!-- stilisierter Scooter: Lenker, Lenkstange, Trittbrett, zwei Räder -->
    <g fill="none" stroke="url(#metal)" stroke-width="9" stroke-linecap="round">
      <path d="M250 200 h96"/>
      <path d="M298 205 L298 372"/>
      <path d="M282 372 L556 372"/>
      <path d="M556 372 L566 330"/>
    </g>
    <circle cx="272" cy="404" r="34" fill="none" stroke="url(#metal)" stroke-width="9"/>
    <circle cx="556" cy="404" r="34" fill="none" stroke="url(#metal)" stroke-width="9"/>
    <rect x="292" y="228" width="46" height="30" rx="6" fill="#1b1d21" stroke="#3a3e46" stroke-width="3"/>
  </g>
  <rect x="0" y="516" width="800" height="84" fill="#08090a" opacity="0.86"/>
  <text x="40" y="552" fill="#e8eaed" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="24" font-weight="500">${escapeXml(label)}</text>
  <text x="40" y="578" fill="#8a9099" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="16">${escapeXml(view)} · Demo-Bild</text>
  <rect x="0.5" y="0.5" width="799" height="599" fill="none" stroke="#1e2025"/>
</svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
