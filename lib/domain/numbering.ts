/**
 * Vergabe der sichtbaren Nummern.
 *
 * Zwei Nummernkreise, weil zwei verschiedene Dinge benannt werden:
 *
 *  - **Artikelnummer (SKU)** — `ET-REI-0031`. Benennt die *Sorte*, nicht das
 *    Stück. 40 Bremsbeläge teilen sich eine Nummer; alles andere wäre 40-mal
 *    dieselbe Information. Kein Jahresanteil: Ein Artikel überlebt Jahre, und
 *    eine SKU, die sich zum Jahreswechsel ändert, ist als Suchbegriff wertlos.
 *
 *  - **Stücknummer** — `SK-2026-0042`. Benennt ein einzelnes Gerät. Hier ist
 *    der Jahresanteil sinnvoll: Er sagt auf einen Blick, wie lange das Gerät
 *    schon im Haus ist, und hält den Zähler kurz.
 *
 * Beide Präfixe kommen aus der Kategorie. Der Lagerplatz steckt bewusst *nicht*
 * in der Nummer — sonst müsste beim Umräumen umetikettiert werden.
 *
 * Im Prototyp wird die laufende Nummer aus dem vorhandenen Bestand abgeleitet.
 * Vergebene Nummern werden dabei übersprungen, auch wenn sie dem Muster nicht
 * folgen — sonst vergibt eine von Hand eingetragene Nummer die nächste gleich
 * ein zweites Mal.
 *
 * Was der Anwendungscode nicht leisten kann, ist der Gleichzeitigkeitsfall:
 * Zwei offene Tabs lesen denselben Bestand und ziehen dieselbe Nummer. In der
 * Produktion übernimmt das eine Postgres-Sequenz je Präfix in derselben
 * Transaktion wie das INSERT, abgesichert durch einen UNIQUE-Index auf der
 * Nummer; ein `MAX()+1` im Anwendungscode wäre dort falsch.
 */

export function createId(prefix = "id"): string {
  // crypto.randomUUID ist in allen Zielbrowsern verfügbar; der Fallback
  // greift nur in exotischen Umgebungen ohne Secure Context.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

// Mindestens vier Stellen, nach oben offen: Ab 10000 würde ein starres {4}
// nicht mehr greifen, das Maximum fiele zurück auf 0 und der Zähler begänne
// erneut bei 0001 — mit doppelten Nummern als Folge.
const COUNTER = "(\\d{4,})"

function escapePrefix(prefix: string): string {
  return prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function highestCounter(existing: string[], pattern: RegExp): number {
  return existing.reduce((max, value) => {
    const match = pattern.exec(value)
    if (!match) return max
    return Math.max(max, Number.parseInt(match[match.length - 1], 10))
  }, 0)
}

/* ------------------------------------------------------------------ */
/* Artikelnummer                                                       */
/* ------------------------------------------------------------------ */

export function nextArticleSku(existing: string[], prefix: string): string {
  const clean = prefix.trim().toUpperCase() || "ART"
  const pattern = new RegExp(`^${escapePrefix(clean)}-${COUNTER}$`)
  const taken = new Set(existing)

  // MAX+1 allein reicht nicht: Eine von Hand vergebene oder importierte
  // Nummer muss dem Muster nicht folgen und zählt dann beim Maximum nicht
  // mit — die nächste „freie" Nummer wäre bereits vergeben. Deshalb wird
  // hochgezählt, bis die Nummer wirklich frei ist.
  let next = highestCounter(existing, pattern) + 1
  while (taken.has(`${clean}-${String(next).padStart(4, "0")}`)) next += 1
  return `${clean}-${String(next).padStart(4, "0")}`
}

/** Reserviert mehrere Artikelnummern am Stück — für den Import. */
export function nextArticleSkus(
  existing: string[],
  prefix: string,
  count: number
): string[] {
  const pool = [...existing]
  const result: string[] = []
  for (let index = 0; index < count; index += 1) {
    const sku = nextArticleSku(pool, prefix)
    pool.push(sku)
    result.push(sku)
  }
  return result
}

/* ------------------------------------------------------------------ */
/* Stücknummer                                                         */
/* ------------------------------------------------------------------ */

export function nextUnitNumber(
  existing: string[],
  prefix: string,
  year: number = new Date().getFullYear()
): string {
  const clean = prefix.trim().toUpperCase() || "ART"
  const pattern = new RegExp(`^${escapePrefix(clean)}-(\\d{4})-${COUNTER}$`)

  const highest = existing.reduce((max, value) => {
    const match = pattern.exec(value)
    if (!match) return max
    if (Number.parseInt(match[1], 10) !== year) return max
    return Math.max(max, Number.parseInt(match[2], 10))
  }, 0)

  const taken = new Set(existing)
  let next = highest + 1
  while (taken.has(`${clean}-${year}-${String(next).padStart(4, "0")}`)) next += 1
  return `${clean}-${year}-${String(next).padStart(4, "0")}`
}

/** Reserviert mehrere Stücknummern am Stück — für den Import. */
export function nextUnitNumbers(
  existing: string[],
  prefix: string,
  count: number,
  year: number = new Date().getFullYear()
): string[] {
  const pool = [...existing]
  const result: string[] = []
  for (let index = 0; index < count; index += 1) {
    const number = nextUnitNumber(pool, prefix, year)
    pool.push(number)
    result.push(number)
  }
  return result
}

/* ------------------------------------------------------------------ */
/* Dublettenerkennung                                                  */
/* ------------------------------------------------------------------ */

/** Vereinheitlicht Seriennummern und Teilenummern für den Vergleich. */
export function normalizeReference(value: string): string {
  return value.replace(/[\s\-_./]+/g, "").toUpperCase()
}
