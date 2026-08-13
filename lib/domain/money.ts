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

/**
 * "1.249,00" → 124900. Akzeptiert deutsche und englische Schreibweise.
 *
 * Das Trennzeichen wird aus der Position bestimmt, nicht aus dem Zeichen:
 * Das *letzte* Komma oder Punkt trennt die Nachkommastellen, alles davor
 * gruppiert nur Tausender. Sonst würde "1,234.56" als 1,23 gelesen — ein
 * Fehler um den Faktor 1000, wie er bei englischen Lieferantenlisten
 * zuverlässig auftritt.
 */
export function parseCents(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, "").trim()
  if (cleaned === "" || cleaned === "-") return null

  const negative = cleaned.startsWith("-")
  const digitsAndSeparators = cleaned.replace(/-/g, "")

  const lastSeparator = Math.max(
    digitsAndSeparators.lastIndexOf(","),
    digitsAndSeparators.lastIndexOf(".")
  )

  // Ein einzelnes Trennzeichen mit drei Folgeziffern ist mehrdeutig
  // ("1.234"). Bei Punkt gilt es als Tausendertrenner, bei Komma ebenso —
  // beide Schreibweisen meinen dort denselben Betrag.
  const decimals = digitsAndSeparators.length - lastSeparator - 1
  const hasDecimalPart = lastSeparator !== -1 && decimals > 0 && decimals < 3

  const whole = (
    hasDecimalPart
      ? digitsAndSeparators.slice(0, lastSeparator)
      : digitsAndSeparators
  ).replace(/[.,]/g, "")
  const fraction = hasDecimalPart
    ? digitsAndSeparators.slice(lastSeparator + 1).padEnd(2, "0")
    : "00"

  if (whole === "" && !hasDecimalPart) return null

  const value = Number.parseInt(`${whole || "0"}${fraction}`, 10)
  if (Number.isNaN(value)) return null
  return negative ? -value : value
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

/**
 * YYYY-MM-DD für <input type="date">.
 *
 * Bewusst lokal formatiert: `toISOString()` rechnet nach UTC und macht aus
 * einem deutschen Sommer-Datum den Vortag. Da der Wert aus dem Eingabefeld
 * anschließend wieder gespeichert wird, würde sich das Datum bei jedem
 * Bearbeiten erneut um einen Tag zurückschieben.
 */
export function toDateInput(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} Min.`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} Std.` : `${hours} Std. ${rest} Min.`
}
