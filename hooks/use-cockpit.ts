"use client"

/**
 * Lesezugriff für Komponenten.
 *
 * Schreiben läuft über `repositories` (Repository-Pattern), Lesen über diese
 * Hooks. Damit greift keine Komponente direkt auf den Store oder gar auf
 * Mock-Arrays zu, und der Austausch der Datenquelle bleibt lokal.
 */

import { useSyncExternalStore } from "react"

import {
  computeDashboardMetrics,
  computePipeline,
  computeSalesMetrics,
  filterSalesThisMonth,
} from "@/lib/domain/metrics"
import { isInStock } from "@/lib/domain/status"
import type { Scooter } from "@/lib/domain/types"
import {
  isStoreHydrated,
  subscribeToHydration,
  useCockpitStore,
} from "@/lib/store/cockpit-store"

/**
 * Wurde der persistierte Zustand aus dem localStorage geladen?
 *
 * Datenabhängige Ansichten zeigen bis dahin Skeletons — sonst würde der
 * serverseitig gerenderte Seed-Bestand kurz aufblitzen und beim Rehydrieren
 * durch die echten Demo-Daten ersetzt.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToHydration,
    isStoreHydrated,
    () => false
  )
}

/* ------------------------------------------------------------------ */
/* Scooter                                                             */
/* ------------------------------------------------------------------ */

export function useScooters(): Scooter[] {
  return useCockpitStore((state) => state.scooters)
}

export function useScooter(id: string | undefined): Scooter | undefined {
  return useCockpitStore((state) =>
    id ? state.scooters.find((scooter) => scooter.id === id) : undefined
  )
}

/** Nur der aktive Bestand — ohne verkaufte und archivierte Geräte. */
export function useStockScooters(): Scooter[] {
  const scooters = useScooters()
  return scooters.filter(isInStock)
}

/* ------------------------------------------------------------------ */
/* Verkäufe & Aktivitäten                                              */
/* ------------------------------------------------------------------ */

export function useSales() {
  return useCockpitStore((state) => state.sales)
}

export function useActivity() {
  return useCockpitStore((state) => state.activity)
}

export function useImportBatches() {
  return useCockpitStore((state) => state.importBatches)
}

export function useIntegrationState() {
  return useCockpitStore((state) => state.integrations)
}

export function useSavedMapping() {
  return useCockpitStore((state) => state.savedMapping)
}

export function useCurrentUser() {
  return useCockpitStore((state) => state.user)
}

/* ------------------------------------------------------------------ */
/* Abgeleitete Kennzahlen                                              */
/* ------------------------------------------------------------------ */

export function useDashboardMetrics() {
  const scooters = useScooters()
  const sales = useSales()
  return computeDashboardMetrics(scooters, sales)
}

export function usePipeline() {
  const scooters = useScooters()
  const sales = useSales()
  return computePipeline(scooters, sales)
}

export function useSalesMetrics(scope: "month" | "all" = "month") {
  const sales = useSales()
  return computeSalesMetrics(
    scope === "month" ? filterSalesThisMonth(sales) : sales
  )
}

/** Eindeutige Herstellerliste für Filter — immer alphabetisch. */
export function useManufacturers(): string[] {
  const scooters = useScooters()
  return [...new Set(scooters.map((s) => s.manufacturer).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "de")
  )
}

export function useLocations(): string[] {
  const scooters = useScooters()
  return [...new Set(scooters.map((s) => s.location).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "de")
  )
}
