/**
 * Kennzahlen. Alles wird aus den Rohdaten berechnet und nirgends gespeichert —
 * eine nachgetragene Reparatur verändert die Marge sofort und überall.
 *
 * Wichtig: "Marge" ist hier eine operative Rechengröße
 * (Verkaufspreis − Einkauf − Reparaturen − weitere Kosten) und ausdrücklich
 * kein steuerlicher Gewinn. Differenzbesteuerung ist bewusst nicht abgebildet.
 */

import { isInStock, isListed } from "./status"
import type { CustomerSource, Sale, SaleChannel, Scooter } from "./types"

/* ------------------------------------------------------------------ */
/* Kosten je Scooter                                                   */
/* ------------------------------------------------------------------ */

export function repairCostsCents(scooter: Scooter): number {
  return scooter.repairs.reduce((sum, repair) => sum + repair.partCostCents, 0)
}

export function totalCostCents(scooter: Scooter): number {
  return (
    scooter.purchasePriceCents +
    repairCostsCents(scooter) +
    scooter.additionalCostsCents
  )
}

/** Erwartete Marge auf Basis des kalkulierten Verkaufspreises. */
export function expectedMarginCents(scooter: Scooter): number | null {
  if (scooter.salePriceCents === null) return null
  return scooter.salePriceCents - totalCostCents(scooter)
}

export function marginPercent(
  marginCents: number,
  salePriceCents: number
): number | null {
  if (salePriceCents <= 0) return null
  return Math.round((marginCents / salePriceCents) * 1000) / 10
}

export function totalLaborMinutes(scooter: Scooter): number {
  return scooter.repairs.reduce((sum, repair) => sum + repair.laborMinutes, 0)
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
  inStock: number
  readyForSale: number
  inRefurbishment: number
  inInspection: number
  inbound: number
  listed: number
  reserved: number
  soldThisMonth: number
  revenueThisMonthCents: number
  averageMarginCents: number
  openInspections: number
  failedSyncs: number
}

function isSameMonth(iso: string, reference: Date): boolean {
  const date = new Date(iso)
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth()
  )
}

export function computeDashboardMetrics(
  scooters: Scooter[],
  sales: Sale[],
  now: Date = new Date()
): DashboardMetrics {
  const stock = scooters.filter(isInStock)
  const salesThisMonth = sales.filter((sale) => isSameMonth(sale.soldAt, now))

  const revenueThisMonthCents = salesThisMonth.reduce(
    (sum, sale) => sum + sale.salePriceCents,
    0
  )
  const marginSum = salesThisMonth.reduce(
    (sum, sale) => sum + saleMarginCents(sale),
    0
  )

  const failedListings = scooters.filter((scooter) =>
    scooter.listings.some((listing) => listing.status === "FEHLER")
  ).length
  const failedSheets = sales.filter(
    (sale) => sale.sheetsSyncStatus === "FEHLER"
  ).length

  return {
    inStock: stock.length,
    readyForSale: stock.filter((s) => s.workflowStatus === "VERKAUFSBEREIT")
      .length,
    inRefurbishment: stock.filter((s) => s.workflowStatus === "AUFBEREITUNG")
      .length,
    inInspection: stock.filter((s) => s.workflowStatus === "IN_PRUEFUNG").length,
    inbound: stock.filter((s) => s.workflowStatus === "EINGEGANGEN").length,
    listed: stock.filter(isListed).length,
    reserved: stock.filter((s) => s.saleStatus === "RESERVIERT").length,
    soldThisMonth: salesThisMonth.length,
    revenueThisMonthCents,
    averageMarginCents:
      salesThisMonth.length === 0
        ? 0
        : Math.round(marginSum / salesThisMonth.length),
    openInspections: stock.filter(
      (s) =>
        s.inspection.completedAt === null && s.workflowStatus !== "ARCHIVIERT"
    ).length,
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
  scooters: Scooter[],
  sales: Sale[]
): PipelineStage[] {
  const stock = scooters.filter(isInStock)
  return [
    {
      key: "EINGEGANGEN",
      label: "Eingegangen",
      count: stock.filter((s) => s.workflowStatus === "EINGEGANGEN").length,
    },
    {
      key: "IN_PRUEFUNG",
      label: "Prüfung",
      count: stock.filter((s) => s.workflowStatus === "IN_PRUEFUNG").length,
    },
    {
      key: "AUFBEREITUNG",
      label: "Aufbereitung",
      count: stock.filter((s) => s.workflowStatus === "AUFBEREITUNG").length,
    },
    {
      key: "VERKAUFSBEREIT",
      label: "Verkaufsbereit",
      count: stock.filter((s) => s.workflowStatus === "VERKAUFSBEREIT").length,
    },
    {
      key: "INSERIERT",
      label: "Inseriert",
      count: stock.filter(isListed).length,
    },
    { key: "VERKAUFT", label: "Verkauft", count: sales.length },
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
export function computeCapitalByStage(scooters: Scooter[]): CapitalStage[] {
  const stages: { key: Scooter["workflowStatus"]; label: string }[] = [
    { key: "EINGEGANGEN", label: "Eingegangen" },
    { key: "IN_PRUEFUNG", label: "Prüfung" },
    { key: "AUFBEREITUNG", label: "Aufbereitung" },
    { key: "VERKAUFSBEREIT", label: "Verkaufsbereit" },
  ]

  const stock = scooters.filter(isInStock)

  return stages.map(({ key, label }) => {
    const group = stock.filter((scooter) => scooter.workflowStatus === key)
    return {
      key,
      label,
      count: group.length,
      tiedCents: group.reduce((sum, scooter) => sum + totalCostCents(scooter), 0),
    }
  })
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
