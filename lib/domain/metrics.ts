/**
 * Kennzahlen. Alles wird aus den Rohdaten berechnet und nirgends gespeichert —
 * eine nachgetragene Reparatur verändert die Marge sofort und überall.
 *
 * Wichtig: "Marge" ist hier eine operative Rechengröße
 * (Verkaufspreis − Einkauf − Reparaturen − weitere Kosten) und ausdrücklich
 * kein steuerlicher Gewinn. Differenzbesteuerung ist bewusst nicht abgebildet.
 */

import { isInStock, isListed } from "./status"
import type { Sale, Scooter } from "./types"

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
