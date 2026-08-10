/**
 * Geld- und Datumsformatierung.
 *
 * Beträge liegen im gesamten System als ganze Cent vor. Es gibt genau eine
 * Stelle, die daraus Text macht — diese hier.
 */

const currencyFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const currencyCompactFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat("de-DE")

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—"
  return currencyFormatter.format(cents / 100)
}

/** Ohne Nachkommastellen — für KPI-Kacheln, wo Cent nur Unruhe stiften. */
export function formatCentsCompact(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—"
  return currencyCompactFormatter.format(Math.round(cents / 100))
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export function formatKm(km: number): string {
  return `${numberFormatter.format(km)} km`
}

/** "1.249,00" → 124900. Akzeptiert deutsche und englische Schreibweise. */
export function parseCents(input: string): number | null {
  const cleaned = input
    .replace(/[^\d,.-]/g, "")
    .trim()
    .replace(/\.(?=\d{3}\b)/g, "") // Tausenderpunkte entfernen
    .replace(",", ".")
  if (cleaned === "" || cleaned === "-") return null
  const value = Number.parseFloat(cleaned)
  if (Number.isNaN(value)) return null
  return Math.round(value * 100)
}

/** Für Eingabefelder: 124900 → "1249,00" */
export function centsToInput(cents: number | null): string {
  if (cents === null) return ""
  return (cents / 100).toFixed(2).replace(".", ",")
}

/* ------------------------------------------------------------------ */
/* Datum                                                               */
/* ------------------------------------------------------------------ */

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

const timeFormatter = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
})

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return dateFormatter.format(new Date(iso))
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  return dateTimeFormatter.format(new Date(iso))
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  return timeFormatter.format(new Date(iso))
}

/** "vor 3 Std." — für Aktivitätslisten und "zuletzt geändert". */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—"
  const then = new Date(iso).getTime()
  const diffMs = Date.now() - then
  const minutes = Math.round(diffMs / 60_000)

  if (minutes < 1) return "gerade eben"
  if (minutes < 60) return `vor ${minutes} Min.`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `vor ${hours} Std.`

  const days = Math.round(hours / 24)
  if (days === 1) return "gestern"
  if (days < 30) return `vor ${days} Tagen`

  return formatDate(iso)
}

/** YYYY-MM-DD für <input type="date"> */
export function toDateInput(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toISOString().slice(0, 10)
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} Min.`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} Std.` : `${hours} Std. ${rest} Min.`
}
