/**
 * Erzeugt Platzhalterbilder als SVG-Data-URL.
 *
 * Der Prototyp soll ohne Bildmaterial auskommen, aber auch keine kaputten
 * Bild-Kacheln zeigen. Die Platzhalter sind bewusst als solche erkennbar und
 * verwenden die Brand-Farben. Sobald Supabase Storage angebunden ist, liefert
 * `StockImage.url` echte URLs — der Rest der Anwendung bleibt unverändert.
 */

const VIEW_LABELS = [
  "Frontansicht",
  "Seitenansicht",
  "Detail Display",
  "Detail Bremse",
  "Rückansicht",
  "Faltmechanismus",
] as const

const PART_VIEW_LABELS = [
  "Produktfoto",
  "Rückseite",
  "Anschluss",
  "Detail",
] as const

export type PlaceholderKind = "GERAET" | "TEIL"

export function placeholderViewLabel(
  index: number,
  kind: PlaceholderKind = "GERAET"
): string {
  const labels = kind === "TEIL" ? PART_VIEW_LABELS : VIEW_LABELS
  return labels[index % labels.length]
}

/**
 * @param label Modellbezeichnung, wird im Bild angezeigt.
 * @param view  Bildunterschrift (z. B. "Seitenansicht").
 * @param seed  Sorgt für leicht unterschiedliche Neigung/Helligkeit je Bild.
 * @param kind  Ersatzteile bekommen eine eigene Silhouette — ein Display mit
 *              Scooter-Umriss wäre im Bestand nicht wiederzuerkennen.
 */
export function createPlaceholderImage(
  label: string,
  view: string,
  seed: number,
  kind: PlaceholderKind = "GERAET"
): string {
  const tilt = -8 + (seed % 5) * 4
  const glow = 0.05 + (seed % 4) * 0.02
  const silhouette = kind === "TEIL" ? partSilhouette(seed) : scooterSilhouette()

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#141619"/>
      <stop offset="100%" stop-color="#0b0c0e"/>
    </linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8ee506"/>
      <stop offset="55%" stop-color="#8d8f95"/>
      <stop offset="100%" stop-color="#4a4f57"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="55%">
      <stop offset="0%" stop-color="#8ee506" stop-opacity="${glow}"/>
      <stop offset="100%" stop-color="#8ee506" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <rect width="800" height="600" fill="url(#glow)"/>
  <g transform="translate(400 300) rotate(${tilt}) translate(-400 -300)" opacity="0.9">
${silhouette}
  </g>
  <rect x="0" y="516" width="800" height="84" fill="#08090a" opacity="0.86"/>
  <text x="40" y="552" fill="#e8eaed" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="24" font-weight="500">${escapeXml(label)}</text>
  <text x="40" y="578" fill="#8a9099" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="16">${escapeXml(view)} · Demo-Bild</text>
  <rect x="0.5" y="0.5" width="799" height="599" fill="none" stroke="#1e2025"/>
</svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** Stilisierter Scooter: Lenker, Lenkstange, Trittbrett, zwei Räder. */
function scooterSilhouette(): string {
  return `    <g fill="none" stroke="url(#metal)" stroke-width="9" stroke-linecap="round">
      <path d="M250 200 h96"/>
      <path d="M298 205 L298 372"/>
      <path d="M282 372 L556 372"/>
      <path d="M556 372 L566 330"/>
    </g>
    <circle cx="272" cy="404" r="34" fill="none" stroke="url(#metal)" stroke-width="9"/>
    <circle cx="556" cy="404" r="34" fill="none" stroke="url(#metal)" stroke-width="9"/>
    <rect x="292" y="228" width="46" height="30" rx="6" fill="#1b1d21" stroke="#3a3e46" stroke-width="3"/>`
}

/**
 * Drei Teile-Silhouetten im Wechsel: Platine, Reifen, Bauteil.
 *
 * Ohne Abwechslung sähen im Ersatzteillager alle Kacheln identisch aus — die
 * Bildspalte wäre dann reine Dekoration statt Wiedererkennung.
 */
function partSilhouette(seed: number): string {
  const variant = seed % 3

  if (variant === 0) {
    return `    <rect x="250" y="220" width="300" height="170" rx="12" fill="#12141a" stroke="url(#metal)" stroke-width="8"/>
    <rect x="284" y="252" width="232" height="106" rx="6" fill="#0b0c0e" stroke="#3a3e46" stroke-width="4"/>
    <g stroke="url(#metal)" stroke-width="6" stroke-linecap="round">
      <path d="M312 288 h60"/><path d="M312 316 h108"/><path d="M312 344 h84"/>
    </g>
    <g fill="url(#metal)"><circle cx="252" cy="410" r="7"/><circle cx="292" cy="410" r="7"/><circle cx="332" cy="410" r="7"/></g>`
  }

  if (variant === 1) {
    return `    <circle cx="400" cy="300" r="140" fill="none" stroke="url(#metal)" stroke-width="26"/>
    <circle cx="400" cy="300" r="82" fill="none" stroke="#3a3e46" stroke-width="10"/>
    <circle cx="400" cy="300" r="26" fill="#1b1d21" stroke="url(#metal)" stroke-width="6"/>
    <g stroke="#3a3e46" stroke-width="6" stroke-linecap="round">
      <path d="M400 218 v-38"/><path d="M400 382 v38"/><path d="M318 300 h-38"/><path d="M482 300 h38"/>
    </g>`
  }

  return `    <path d="M300 250 h200 a24 24 0 0 1 24 24 v92 a24 24 0 0 1 -24 24 h-200 a24 24 0 0 1 -24 -24 v-92 a24 24 0 0 1 24 -24 z" fill="#12141a" stroke="url(#metal)" stroke-width="8"/>
    <path d="M524 292 h44 v56 h-44" fill="none" stroke="url(#metal)" stroke-width="8"/>
    <g stroke="#3a3e46" stroke-width="6" stroke-linecap="round">
      <path d="M330 292 v56"/><path d="M370 292 v56"/><path d="M410 292 v56"/>
    </g>`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
