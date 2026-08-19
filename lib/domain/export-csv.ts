/**
 * Tabellenexport.
 *
 * Die JSON-Vollsicherung ist ein Rückfallpunkt für das System, kein Bericht
 * für Menschen: Wer seinem Steuerberater den Lagerwert zum Stichtag geben
 * oder eine Inventurliste ausdrucken will, kann damit nichts anfangen.
 * Deshalb hier vier Tabellen, die in Excel und Numbers ohne Zwischenschritt
 * aufgehen.
 *
 * Deutsche Tabellenkonventionen, bewusst:
 *
 *  - **Semikolon** als Trennzeichen. Excel in deutscher Lokalisierung
 *    erwartet das; ein Komma landet in einer einzigen Spalte.
 *  - **Komma** als Dezimaltrenner, ohne Tausenderpunkt — sonst liest Excel
 *    „1.234,50" als Text und rechnet nicht mehr damit.
 *  - **BOM** am Dateianfang. Ohne ihn zeigt Excel „Straße" als „StraÃŸe".
 *  - **ISO-Datum** (JJJJ-MM-TT), weil es sich sortieren lässt.
 */

import { resolveCategorySettings } from "@/lib/domain/categories"
import { articleLabel, unitLabel } from "@/lib/domain/article-factory"
import { repairCostsCents } from "@/lib/domain/metrics"
import type {
  Article,
  ArticleUnit,
  ArticleView,
  Category,
  Sale,
  StockMovement,
  StorageLocation,
  Teardown,
} from "@/lib/domain/types"

type Cell = string | number | null | undefined

/** Ganze Cent als deutsche Dezimalzahl — ohne Währungszeichen, ohne Tausender. */
export function csvEuro(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ""
  return (cents / 100).toFixed(2).replace(".", ",")
}

/** Zeitstempel auf das Datum kürzen; leere Werte bleiben leer. */
function csvDate(value: string | null | undefined): string {
  if (!value) return ""
  return value.slice(0, 10)
}

/**
 * Eine Zelle maskieren.
 *
 * Anführungszeichen kommen nur dort hin, wo sie nötig sind — eine Datei, in
 * der jedes Feld in Anführungszeichen steht, ist von Hand nicht mehr lesbar.
 */
function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return ""
  const text = String(value)
  if (!/[";\n\r]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

export function toCsv(rows: Cell[][]): string {
  // \r\n, weil Excel unter Windows sonst alles in eine Zeile schreibt.
  return "﻿" + rows.map((row) => row.map(escapeCell).join(";")).join("\r\n")
}

/* ------------------------------------------------------------------ */
/* Bestandsliste                                                       */
/* ------------------------------------------------------------------ */

/**
 * Was tatsächlich im Lager liegt, mit Wert.
 *
 * Serialisierte Artikel stehen mit ihrer Stückzahl, nicht mit jedem Gerät —
 * die Geräteliste ist der zweite Export.
 */
export function stockCsv(
  views: ArticleView[],
  categories: Category[],
  locations: StorageLocation[]
): string {
  const locationName = new Map(locations.map((entry) => [entry.id, entry.code]))

  const rows: Cell[][] = [
    [
      "Artikelnummer",
      "Bezeichnung",
      "Hersteller",
      "Teilenummer",
      "Bereich",
      "Bestandsart",
      "Bestand",
      "Meldebestand",
      "Ø Einstand",
      "Verkaufspreis",
      "Lagerwert",
      "Lagerplätze",
      "Zuletzt geändert",
    ],
  ]

  for (const view of views) {
    const settings = resolveCategorySettings(categories, view.article.categoryId)
    const places = Object.entries(view.stock.byLocation)
      .filter(([, quantity]) => quantity !== 0)
      .map(
        ([id, quantity]) =>
          `${id ? (locationName.get(id) ?? "unbekannt") : "ohne Platz"}: ${quantity}`
      )
      .join(", ")

    rows.push([
      view.article.sku,
      articleLabel(view.article),
      view.article.manufacturer,
      view.article.mpn,
      settings.pathLabel,
      view.article.stockMode === "MENGE" ? "Menge" : "Einzelstücke",
      view.stock.quantity,
      view.stock.reorderLevel,
      csvEuro(view.stock.averageCostCents),
      csvEuro(view.article.salePriceCents),
      csvEuro(view.stock.valueCents),
      places,
      csvDate(view.article.updatedAt),
    ])
  }

  return toCsv(rows)
}

/* ------------------------------------------------------------------ */
/* Geräteliste                                                         */
/* ------------------------------------------------------------------ */

export function unitsCsv(
  units: ArticleUnit[],
  articles: Article[],
  categories: Category[],
  locations: StorageLocation[]
): string {
  const articleById = new Map(articles.map((entry) => [entry.id, entry]))
  const locationName = new Map(locations.map((entry) => [entry.id, entry.code]))

  const rows: Cell[][] = [
    [
      "Stücknummer",
      "Seriennummer",
      "Bezeichnung",
      "Artikelnummer",
      "Bereich",
      "Zustand",
      "Status",
      "Verkaufsstatus",
      "Lagerplatz",
      "Laufleistung km",
      "Einkauf",
      "Zusatzkosten",
      "Reparaturkosten",
      "Verkaufspreis",
      "Zugang",
    ],
  ]

  for (const unit of units) {
    const article = articleById.get(unit.articleId)
    const settings = article
      ? resolveCategorySettings(categories, article.categoryId)
      : null

    rows.push([
      unit.unitNumber,
      unit.serialNumber,
      article ? unitLabel(article, unit) : "",
      article?.sku ?? "",
      settings?.pathLabel ?? "",
      unit.condition,
      unit.workflowStatus,
      unit.saleStatus,
      unit.locationId ? (locationName.get(unit.locationId) ?? "") : "",
      unit.mileageKm,
      csvEuro(unit.purchasePriceCents),
      csvEuro(unit.additionalCostsCents),
      csvEuro(repairCostsCents(unit)),
      csvEuro(unit.salePriceCents),
      csvDate(unit.arrivalDate || unit.createdAt),
    ])
  }

  return toCsv(rows)
}

/* ------------------------------------------------------------------ */
/* Bewegungsjournal                                                    */
/* ------------------------------------------------------------------ */

/**
 * Jede Buchung mit ihrem Grund — die Grundlage jeder Nachfrage vom Typ
 * „warum standen da im März 40 Stück?".
 */
export function movementsCsv(
  movements: StockMovement[],
  articles: Article[],
  units: ArticleUnit[],
  locations: StorageLocation[]
): string {
  const articleById = new Map(articles.map((entry) => [entry.id, entry]))
  const unitById = new Map(units.map((entry) => [entry.id, entry]))
  const locationName = new Map(locations.map((entry) => [entry.id, entry.code]))

  const rows: Cell[][] = [
    [
      "Zeitpunkt",
      "Art",
      "Artikelnummer",
      "Bezeichnung",
      "Stücknummer",
      "Menge",
      "Einstand je Stück",
      "Von Lagerplatz",
      "Nach Lagerplatz",
      "Bearbeiter",
      "Notiz",
    ],
  ]

  // Chronologisch aufsteigend: So liest sich das Journal wie ein Kontoauszug.
  const chronological = [...movements].sort((a, b) => a.at.localeCompare(b.at))

  for (const movement of chronological) {
    const article = articleById.get(movement.articleId)
    const unit = movement.unitId ? unitById.get(movement.unitId) : undefined

    rows.push([
      movement.at.replace("T", " ").slice(0, 16),
      movement.type,
      article?.sku ?? "",
      article ? articleLabel(article) : "",
      unit?.unitNumber ?? "",
      movement.quantity,
      csvEuro(movement.unitCostCents),
      movement.locationId ? (locationName.get(movement.locationId) ?? "") : "",
      movement.toLocationId
        ? (locationName.get(movement.toLocationId) ?? "")
        : "",
      movement.actor,
      movement.note,
    ])
  }

  return toCsv(rows)
}

/* ------------------------------------------------------------------ */
/* Verkäufe                                                            */
/* ------------------------------------------------------------------ */

/**
 * Umsatzliste mit Marge.
 *
 * Stornierte Verkäufe stehen mit dabei und sind als solche gekennzeichnet:
 * Eine Liste, in der sie fehlen, lässt sich mit keinem Kontoauszug abgleichen.
 */
export function salesCsv(sales: Sale[]): string {
  const rows: Cell[][] = [
    [
      "Verkaufsdatum",
      "Nummer",
      "Bezeichnung",
      "Seriennummer",
      "Bereich",
      "Menge",
      "Kanal",
      "Kundenquelle",
      "Region",
      "Verkauf",
      "Einkauf",
      "Reparaturkosten",
      "Zusatzkosten",
      "Marge",
      "Storniert am",
      "Stornogrund",
      "Ware zurück",
      "Notiz",
    ],
  ]

  const chronological = [...sales].sort((a, b) => a.soldAt.localeCompare(b.soldAt))

  for (const sale of chronological) {
    const margin =
      sale.salePriceCents -
      sale.purchasePriceCents -
      sale.repairCostsCents -
      sale.additionalCostsCents

    rows.push([
      csvDate(sale.soldAt),
      sale.itemNumber,
      sale.itemLabel,
      sale.serialNumber,
      sale.categoryLabel,
      sale.quantity,
      sale.channel,
      sale.customerSource,
      sale.customerRegion,
      csvEuro(sale.salePriceCents),
      csvEuro(sale.purchasePriceCents),
      csvEuro(sale.repairCostsCents),
      csvEuro(sale.additionalCostsCents),
      csvEuro(margin),
      csvDate(sale.cancelledAt),
      sale.cancelReason,
      sale.cancelledAt ? (sale.cancelRestocked ? "ja" : "nein") : "",
      sale.note,
    ])
  }

  return toCsv(rows)
}

/* ------------------------------------------------------------------ */
/* Ausschlachtungen                                                    */
/* ------------------------------------------------------------------ */

/** Je Zeile ein entnommenes Teil, mit dem Spender daneben. */
export function teardownsCsv(
  teardowns: Teardown[],
  articles: Article[],
  locations: StorageLocation[]
): string {
  const articleById = new Map(articles.map((entry) => [entry.id, entry]))
  const locationName = new Map(locations.map((entry) => [entry.id, entry.code]))

  const rows: Cell[][] = [
    [
      "Datum",
      "Spender",
      "Spendernummer",
      "Einkaufswert Spender",
      "Verteilung",
      "Schrottanteil",
      "Teil Artikelnummer",
      "Teil Bezeichnung",
      "Menge",
      "Einstand je Stück",
      "Lagerplatz",
      "Status",
    ],
  ]

  for (const teardown of teardowns) {
    for (const line of teardown.lines) {
      const article = articleById.get(line.articleId)
      rows.push([
        csvDate(teardown.at),
        teardown.sourceLabel,
        teardown.sourceNumber,
        csvEuro(teardown.sourceValueCents),
        teardown.distribution,
        csvEuro(teardown.scrapValueCents),
        article?.sku ?? "",
        article ? articleLabel(article) : "",
        line.quantity,
        csvEuro(line.valueShareCents),
        line.locationId ? (locationName.get(line.locationId) ?? "") : "",
        teardown.status,
      ])
    }
  }

  return toCsv(rows)
}

/* ------------------------------------------------------------------ */
/* Inventurliste                                                       */
/* ------------------------------------------------------------------ */

/**
 * Zählliste zum Ausdrucken: Sollbestand steht drin, die Zählspalte bleibt
 * leer. Wer im Lager mit Klemmbrett zählt, trägt sie von Hand ein und
 * überträgt die Abweichungen später in die Inventurmaske.
 */
export function stocktakeCsv(
  views: ArticleView[],
  categories: Category[],
  locations: StorageLocation[],
  locationId: string | null
): string {
  const locationName = locationId
    ? (locations.find((entry) => entry.id === locationId)?.code ?? "")
    : "alle Plätze"

  const rows: Cell[][] = [
    [`Inventurliste ${new Date().toISOString().slice(0, 10)} · ${locationName}`],
    [],
    [
      "Artikelnummer",
      "Bezeichnung",
      "Bereich",
      "Lagerplatz",
      "Soll",
      "Gezählt",
      "Differenz",
    ],
  ]

  for (const view of views) {
    if (view.article.stockMode !== "MENGE") continue
    if (view.article.archivedAt !== null) continue

    const expected = locationId
      ? (view.stock.byLocation[locationId] ?? 0)
      : view.stock.quantity
    if (locationId && expected === 0) continue

    const settings = resolveCategorySettings(categories, view.article.categoryId)
    rows.push([
      view.article.sku,
      articleLabel(view.article),
      settings.pathLabel,
      locationName,
      expected,
      "",
      "",
    ])
  }

  return toCsv(rows)
}

/* ------------------------------------------------------------------ */
/* Download                                                            */
/* ------------------------------------------------------------------ */

/** Legt den Text als Datei in den Download-Ordner. */
export function downloadCsv(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  // Objekt-URL freigeben, sonst hält sie den Blob im Speicher.
  URL.revokeObjectURL(url)
}

/** Dateiname mit Datum: „skope-bestand-2026-08-19.csv". */
export function csvFileName(kind: string): string {
  return `skope-${kind}-${new Date().toISOString().slice(0, 10)}.csv`
}
