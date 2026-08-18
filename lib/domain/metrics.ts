/**
 * Kennzahlen. Alles wird aus den Rohdaten berechnet und nirgends gespeichert —
 * eine nachgetragene Reparatur verändert die Marge sofort und überall.
 *
 * Wichtig: "Marge" ist hier eine operative Rechengröße
 * (Verkaufspreis − Einkauf − Reparaturen − weitere Kosten) und ausdrücklich
 * kein steuerlicher Gewinn. Differenzbesteuerung ist bewusst nicht abgebildet.
 */

import { isListed } from "./status"
import { daysInStock, isUnitInStock } from "./stock"
import type {
  Article,
  ArticleUnit,
  CustomerSource,
  Sale,
  SaleChannel,
  StockLevel,
} from "./types"

/* ------------------------------------------------------------------ */
/* Kosten je Einzelstück                                               */
/* ------------------------------------------------------------------ */

export function repairCostsCents(unit: ArticleUnit): number {
  return unit.repairs.reduce((sum, repair) => sum + repair.partCostCents, 0)
}

export function totalCostCents(unit: ArticleUnit): number {
  return (
    unit.purchasePriceCents + repairCostsCents(unit) + unit.additionalCostsCents
  )
}

/** Erwartete Marge auf Basis des kalkulierten Verkaufspreises. */
export function expectedMarginCents(unit: ArticleUnit): number | null {
  if (unit.salePriceCents === null) return null
  return unit.salePriceCents - totalCostCents(unit)
}

/** Erwartete Marge eines Mengenartikels je Stück. */
export function expectedArticleMarginCents(
  article: Article,
  stock: StockLevel
): number | null {
  if (article.salePriceCents === null) return null
  return article.salePriceCents - stock.averageCostCents
}

export function marginPercent(
  marginCents: number,
  salePriceCents: number
): number | null {
  if (salePriceCents <= 0) return null
  return Math.round((marginCents / salePriceCents) * 1000) / 10
}

export function totalLaborMinutes(unit: ArticleUnit): number {
  return unit.repairs.reduce((sum, repair) => sum + repair.laborMinutes, 0)
}

/* ------------------------------------------------------------------ */
/* Marge je Verkauf                                                    */
/* ------------------------------------------------------------------ */

export function saleMarginCents(sale: Sale): number {
  return (
    sale.salePriceCents -
    sale.purchasePriceCents -
    sale.repairCostsCents -
    sale.additionalCostsCents
  )
}

export function saleCostCents(sale: Sale): number {
  return sale.purchasePriceCents + sale.repairCostsCents + sale.additionalCostsCents
}

/* ------------------------------------------------------------------ */
/* Dashboard-Kennzahlen                                                */
/* ------------------------------------------------------------------ */

export interface DashboardMetrics {
  /** Anzahl geführter Artikel (Sorten), ohne archivierte. */
  articleCount: number
  /** Summe aller Stückzahlen über alle Artikel. */
  pieceCount: number
  /** Einstandswert des gesamten Lagers. */
  stockValueCents: number

  /** Einzelstücke im Bestand, nach Prozessstufe. */
  unitsInStock: number
  readyForSale: number
  inRefurbishment: number
  inInspection: number
  inbound: number
  listed: number
  reserved: number
  openInspections: number

  /** Mengenartikel unter dem Meldebestand. */
  belowReorderLevel: number
  /** Vorschläge, die auf Freigabe warten. */
  openProposals: number

  soldThisMonth: number
  revenueThisMonthCents: number
  averageMarginCents: number
  failedSyncs: number
}

function isSameMonth(iso: string, reference: Date): boolean {
  const date = new Date(iso)
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth()
  )
}

export interface MetricsInput {
  articles: Article[]
  units: ArticleUnit[]
  levels: Map<string, StockLevel>
  sales: Sale[]
  openProposals: number
}

export function computeDashboardMetrics(
  input: MetricsInput,
  now: Date = new Date()
): DashboardMetrics {
  const { articles, units, levels, sales } = input

  const active = articles.filter((article) => article.archivedAt === null)
  const unitsInStock = units.filter(isUnitInStock)
  const salesThisMonth = sales.filter((sale) => isSameMonth(sale.soldAt, now))

  let pieceCount = 0
  let stockValueCents = 0
  let belowReorderLevel = 0

  for (const article of active) {
    const level = levels.get(article.id)
    if (!level) continue
    pieceCount += level.quantity
    stockValueCents += level.valueCents
    if (level.belowReorderLevel) belowReorderLevel += 1
  }

  const revenueThisMonthCents = salesThisMonth.reduce(
    (sum, sale) => sum + sale.salePriceCents,
    0
  )
  const marginSum = salesThisMonth.reduce(
    (sum, sale) => sum + saleMarginCents(sale),
    0
  )

  // Fehlgeschlagene Übertragungen werden über alle Ebenen gezählt: ein Fehler
  // am Mengenartikel wiegt nicht weniger als einer an einem Gerät.
  const failedListings =
    active.filter((article) =>
      article.listings.some((listing) => listing.status === "FEHLER")
    ).length +
    unitsInStock.filter((unit) =>
      unit.listings.some((listing) => listing.status === "FEHLER")
    ).length
  const failedSheets = sales.filter(
    (sale) => sale.sheetsSyncStatus === "FEHLER"
  ).length

  const byStatus = (status: ArticleUnit["workflowStatus"]) =>
    unitsInStock.filter((unit) => unit.workflowStatus === status).length

  return {
    articleCount: active.length,
    pieceCount,
    stockValueCents,

    unitsInStock: unitsInStock.length,
    readyForSale: byStatus("VERKAUFSBEREIT"),
    inRefurbishment: byStatus("AUFBEREITUNG"),
    inInspection: byStatus("IN_PRUEFUNG"),
    inbound: byStatus("EINGEGANGEN"),
    listed:
      unitsInStock.filter(isListed).length +
      active.filter(isListed).length,
    reserved: unitsInStock.filter((unit) => unit.saleStatus === "RESERVIERT")
      .length,
    openInspections: unitsInStock.filter(
      (unit) => unit.inspection.completedAt === null
    ).length,

    belowReorderLevel,
    openProposals: input.openProposals,

    soldThisMonth: salesThisMonth.length,
    revenueThisMonthCents,
    averageMarginCents:
      salesThisMonth.length === 0
        ? 0
        : Math.round(marginSum / salesThisMonth.length),
    failedSyncs: failedListings + failedSheets,
  }
}

/** Mengen je Prozessstufe für die Pipeline-Visualisierung. */
export interface PipelineStage {
  key: string
  label: string
  count: number
}

export function computePipeline(
  units: ArticleUnit[],
  sales: Sale[]
): PipelineStage[] {
  const stock = units.filter(isUnitInStock)
  const byStatus = (status: ArticleUnit["workflowStatus"]) =>
    stock.filter((unit) => unit.workflowStatus === status).length

  return [
    { key: "EINGEGANGEN", label: "Eingegangen", count: byStatus("EINGEGANGEN") },
    { key: "IN_PRUEFUNG", label: "Prüfung", count: byStatus("IN_PRUEFUNG") },
    { key: "AUFBEREITUNG", label: "Aufbereitung", count: byStatus("AUFBEREITUNG") },
    {
      key: "VERKAUFSBEREIT",
      label: "Verkaufsbereit",
      count: byStatus("VERKAUFSBEREIT"),
    },
    { key: "INSERIERT", label: "Inseriert", count: stock.filter(isListed).length },
    {
      key: "VERKAUFT",
      label: "Verkauft",
      count: sales.filter((sale) => sale.unitId !== null).length,
    },
  ]
}

/* ------------------------------------------------------------------ */
/* Zeitreihe: Umsatz und Marge je Monat                                */
/* ------------------------------------------------------------------ */

export interface MonthlyRevenue {
  key: string
  /** "Aug" — kurz, weil die Achse schmal ist. */
  label: string
  /** "August 2026" für Tooltip und Vorlesehilfe. */
  fullLabel: string
  revenueCents: number
  marginCents: number
  costCents: number
  count: number
  isCurrent: boolean
}

const MONTH_SHORT = new Intl.DateTimeFormat("de-DE", { month: "short" })
const MONTH_LONG = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
})

/**
 * Die letzten `months` Monate einschließlich des laufenden.
 *
 * Monate ohne Verkauf bleiben als Lücke stehen und werden nicht übersprungen —
 * eine Zeitreihe, die leere Monate verschweigt, zeigt einen Verlauf, den es
 * nicht gab.
 */
export function computeMonthlyRevenue(
  sales: Sale[],
  months = 6,
  now: Date = new Date()
): MonthlyRevenue[] {
  const buckets: MonthlyRevenue[] = []

  for (let offset = months - 1; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    buckets.push({
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: MONTH_SHORT.format(date).replace(".", ""),
      fullLabel: MONTH_LONG.format(date),
      revenueCents: 0,
      marginCents: 0,
      costCents: 0,
      count: 0,
      isCurrent: offset === 0,
    })
  }

  const index = new Map(buckets.map((bucket) => [bucket.key, bucket]))

  for (const sale of sales) {
    const date = new Date(sale.soldAt)
    if (Number.isNaN(date.getTime())) continue
    const bucket = index.get(`${date.getFullYear()}-${date.getMonth()}`)
    if (!bucket) continue
    bucket.revenueCents += sale.salePriceCents
    bucket.marginCents += saleMarginCents(sale)
    bucket.costCents += saleCostCents(sale)
    bucket.count += 1
  }

  return buckets
}

/* ------------------------------------------------------------------ */
/* Verteilung nach Verkaufskanal                                       */
/* ------------------------------------------------------------------ */

export interface ChannelShare {
  channel: SaleChannel
  count: number
  revenueCents: number
  marginCents: number
  /** Anteil am Umsatz, 0–1. */
  share: number
}

/** Kanäle nach Umsatz, ohne Kanäle ohne Verkauf. */
export function computeChannelShares(sales: Sale[]): ChannelShare[] {
  const totals = new Map<SaleChannel, ChannelShare>()

  for (const sale of sales) {
    const entry = totals.get(sale.channel) ?? {
      channel: sale.channel,
      count: 0,
      revenueCents: 0,
      marginCents: 0,
      share: 0,
    }
    entry.count += 1
    entry.revenueCents += sale.salePriceCents
    entry.marginCents += saleMarginCents(sale)
    totals.set(sale.channel, entry)
  }

  const revenue = [...totals.values()].reduce((sum, e) => sum + e.revenueCents, 0)

  return [...totals.values()]
    .map((entry) => ({
      ...entry,
      share: revenue === 0 ? 0 : entry.revenueCents / revenue,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents)
}

/* ------------------------------------------------------------------ */
/* Verteilung nach Kundenherkunft und Region                           */
/* ------------------------------------------------------------------ */

export interface SourceShare {
  source: CustomerSource
  count: number
  revenueCents: number
  marginCents: number
  share: number
}

/** Woher die Kunden kamen — nach Umsatz, ohne leere Kategorien. */
export function computeSourceShares(sales: Sale[]): SourceShare[] {
  const totals = new Map<CustomerSource, SourceShare>()

  for (const sale of sales) {
    // Altbestand ohne Herkunft zählt als "nicht erfasst" und wird nicht geraten.
    const key = sale.customerSource ?? "UNBEKANNT"
    const entry = totals.get(key) ?? {
      source: key,
      count: 0,
      revenueCents: 0,
      marginCents: 0,
      share: 0,
    }
    entry.count += 1
    entry.revenueCents += sale.salePriceCents
    entry.marginCents += saleMarginCents(sale)
    totals.set(key, entry)
  }

  const revenue = [...totals.values()].reduce((sum, e) => sum + e.revenueCents, 0)

  return [...totals.values()]
    .map((entry) => ({
      ...entry,
      share: revenue === 0 ? 0 : entry.revenueCents / revenue,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents)
}

export interface RegionShare {
  region: string
  count: number
  revenueCents: number
}

/** Wohin verkauft wurde. Nicht erfasste Orte werden zusammengefasst. */
export function computeRegionShares(sales: Sale[], limit = 6): RegionShare[] {
  const totals = new Map<string, RegionShare>()

  for (const sale of sales) {
    const region = (sale.customerRegion ?? "").trim() || "Nicht erfasst"
    const entry = totals.get(region) ?? { region, count: 0, revenueCents: 0 }
    entry.count += 1
    entry.revenueCents += sale.salePriceCents
    totals.set(region, entry)
  }

  const sorted = [...totals.values()].sort(
    (a, b) => b.revenueCents - a.revenueCents
  )
  if (sorted.length <= limit) return sorted

  // Der Rest wird zusammengefasst statt abgeschnitten — eine Liste, die
  // stillschweigend endet, behauptet Vollständigkeit, die sie nicht hat.
  const head = sorted.slice(0, limit)
  const tail = sorted.slice(limit)
  return [
    ...head,
    {
      region: `${tail.length} weitere Orte`,
      count: tail.reduce((sum, e) => sum + e.count, 0),
      revenueCents: tail.reduce((sum, e) => sum + e.revenueCents, 0),
    },
  ]
}

/* ------------------------------------------------------------------ */
/* Kapitalbindung je Prozessstufe                                      */
/* ------------------------------------------------------------------ */

export interface CapitalStage {
  key: string
  label: string
  count: number
  /** Bereits investiert: Einkauf + Reparaturen + Nebenkosten. */
  tiedCents: number
}

/**
 * Wie viel Geld steht auf welcher Stufe still?
 *
 * Die Prozessübersicht zählt Geräte; diese Ansicht zeigt, was sie binden —
 * zehn Geräte im Wareneingang sind etwas anderes als zehn kurz vor dem
 * Verkauf.
 */
export function computeCapitalByStage(units: ArticleUnit[]): CapitalStage[] {
  const stages: { key: ArticleUnit["workflowStatus"]; label: string }[] = [
    { key: "EINGEGANGEN", label: "Eingegangen" },
    { key: "IN_PRUEFUNG", label: "Prüfung" },
    { key: "AUFBEREITUNG", label: "Aufbereitung" },
    { key: "VERKAUFSBEREIT", label: "Verkaufsbereit" },
  ]

  const stock = units.filter(isUnitInStock)

  return stages.map(({ key, label }) => {
    const group = stock.filter((unit) => unit.workflowStatus === key)
    return {
      key,
      label,
      count: group.length,
      tiedCents: group.reduce((sum, unit) => sum + totalCostCents(unit), 0),
    }
  })
}

/* ------------------------------------------------------------------ */
/* Lagerauswertung                                                     */
/* ------------------------------------------------------------------ */

export interface CategoryStock {
  categoryId: string
  label: string
  articleCount: number
  pieceCount: number
  valueCents: number
}

/**
 * Bestand je Bereich — die Antwort auf "was habe ich eigentlich alles".
 *
 * Zugeordnet wird auf die Kategorie, in der der Artikel tatsächlich liegt;
 * eine Rollup-Summe auf die Elternebene würde Beträge doppelt zählen.
 */
export function computeCategoryStock(
  articles: Article[],
  levels: Map<string, StockLevel>,
  labelFor: (categoryId: string) => string
): CategoryStock[] {
  const totals = new Map<string, CategoryStock>()

  for (const article of articles) {
    if (article.archivedAt !== null) continue
    const level = levels.get(article.id)
    if (!level) continue

    const entry = totals.get(article.categoryId) ?? {
      categoryId: article.categoryId,
      label: labelFor(article.categoryId),
      articleCount: 0,
      pieceCount: 0,
      valueCents: 0,
    }
    entry.articleCount += 1
    entry.pieceCount += level.quantity
    entry.valueCents += level.valueCents
    totals.set(article.categoryId, entry)
  }

  return [...totals.values()].sort((a, b) => b.valueCents - a.valueCents)
}

export interface SlowMover {
  articleId: string
  unitId: string | null
  label: string
  number: string
  days: number
  tiedCents: number
}

/**
 * Was liegt am längsten?
 *
 * Liegezeit ist bei einem Ersatzteillager die wichtigste Kennzahl neben dem
 * Bestand: Sie zeigt, welches Kapital sich nicht bewegt — und damit, wo eine
 * Preissenkung oder ein Bündelverkauf lohnt.
 */
export function computeSlowMovers(
  articles: Article[],
  units: ArticleUnit[],
  levels: Map<string, StockLevel>,
  labelFor: (article: Article) => string,
  options: { minDays?: number; limit?: number } = {}
): SlowMover[] {
  const minDays = options.minDays ?? 60
  const limit = options.limit ?? 8
  const byId = new Map(articles.map((article) => [article.id, article]))
  const result: SlowMover[] = []

  for (const unit of units) {
    if (!isUnitInStock(unit)) continue
    const article = byId.get(unit.articleId)
    if (!article) continue
    const days = daysInStock(unit.arrivalDate)
    if (days < minDays) continue
    result.push({
      articleId: article.id,
      unitId: unit.id,
      label: labelFor(article),
      number: unit.unitNumber,
      days,
      tiedCents: totalCostCents(unit),
    })
  }

  for (const article of articles) {
    if (article.stockMode !== "MENGE" || article.archivedAt !== null) continue
    const level = levels.get(article.id)
    if (!level || level.quantity === 0) continue
    const days = daysInStock(article.createdAt)
    if (days < minDays) continue
    result.push({
      articleId: article.id,
      unitId: null,
      label: labelFor(article),
      number: article.sku,
      days,
      tiedCents: level.valueCents,
    })
  }

  return result.sort((a, b) => b.tiedCents - a.tiedCents).slice(0, limit)
}

/* ------------------------------------------------------------------ */
/* Verkaufskennzahlen                                                  */
/* ------------------------------------------------------------------ */

export interface SalesMetrics {
  count: number
  revenueCents: number
  marginCents: number
  averagePriceCents: number
}

export function computeSalesMetrics(sales: Sale[]): SalesMetrics {
  const revenueCents = sales.reduce((sum, sale) => sum + sale.salePriceCents, 0)
  const marginCents = sales.reduce((sum, sale) => sum + saleMarginCents(sale), 0)
  return {
    count: sales.length,
    revenueCents,
    marginCents,
    averagePriceCents:
      sales.length === 0 ? 0 : Math.round(revenueCents / sales.length),
  }
}

export function filterSalesThisMonth(sales: Sale[], now: Date = new Date()) {
  return sales.filter((sale) => isSameMonth(sale.soldAt, now))
}
