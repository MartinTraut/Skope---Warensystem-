/**
 * Zentraler Demo-Zustand des Cockpits.
 *
 * Diese Datei ist die *Persistenzschicht* des Prototyps und übernimmt exakt die
 * Rolle, die später Supabase hat: Sie hält die Daten und bietet elementare
 * Schreiboperationen. Fachliche Abläufe (veröffentlichen, verkaufen,
 * synchronisieren) stehen bewusst NICHT hier, sondern im Repository —
 * damit sie beim Wechsel auf eine echte Datenbank erhalten bleiben.
 *
 * Komponenten greifen niemals direkt auf diesen Store zu; sie nutzen die
 * Hooks in `hooks/use-cockpit.ts` und das Repository.
 */

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import {
  createGuardedStorage,
  reportPersistenceProblem,
} from "./persistence-status"

import { createSeedData } from "@/lib/demo/seed"
import type {
  AuditEvent,
  ColumnMapping,
  CurrentUser,
  ImportBatch,
  IntegrationState,
  Sale,
  SaleChannel,
  Scooter,
} from "@/lib/domain/types"

const STORAGE_KEY = "skope-cockpit-demo"
const STORAGE_VERSION = 3

/** Version der Sicherungsdatei. Wandert mit dem Datenmodell mit. */
export const SNAPSHOT_VERSION = STORAGE_VERSION

export interface CockpitState {
  scooters: Scooter[]
  sales: Sale[]
  activity: AuditEvent[]
  importBatches: ImportBatch[]
  integrations: IntegrationState
  /** Zuletzt bestätigtes Spalten-Mapping — beschleunigt Folge-Importe. */
  savedMapping: ColumnMapping[] | null
  user: CurrentUser
  /** UI-Vorliebe, bewusst mitpersistiert statt über einen eigenen Effekt. */
  sidebarCollapsed: boolean
  setSidebarCollapsed(collapsed: boolean): void

  /**
   * Einstellungen der Dashboard-Auswertung.
   *
   * Wird mitpersistiert, weil eine Ansicht, die man bei jedem Aufruf neu
   * einstellen muss, keine Einstellung ist.
   */
  chartPrefs: ChartPrefs
  setChartPrefs(patch: Partial<ChartPrefs>): void

  /* Elementare Schreiboperationen */
  upsertScooters(scooters: Scooter[]): void
  patchScooter(id: string, patch: Partial<Scooter>): void
  /** Änderung über eine Funktion — vermeidet Lost Updates bei Teilobjekten. */
  updateScooter(id: string, updater: (scooter: Scooter) => Scooter): void
  removeScooter(id: string): void

  addSale(sale: Sale): void
  patchSale(id: string, patch: Partial<Sale>): void

  addActivity(events: AuditEvent[]): void

  addImportBatch(batch: ImportBatch): void
  setSavedMapping(mapping: ColumnMapping[]): void

  setIntegrations(patch: Partial<IntegrationState>): void

  /** Vollständiger Austausch des Datenbestands — für das Einspielen einer Sicherung. */
  replaceAll(data: {
    scooters: Scooter[]
    sales: Sale[]
    activity: AuditEvent[]
    importBatches: ImportBatch[]
  }): void

  resetDemoData(): void
}

/** Einstellbare Ansicht der Umsatzauswertung. */
export interface ChartPrefs {
  /** Betrachtungszeitraum in Monaten. */
  months: 3 | 6 | 12
  /** Welche Größe die Balken zeigen. */
  measure: "umsatz" | "marge" | "anzahl"
  /** Darstellungsform. */
  shape: "gestapelt" | "balken" | "linie"
  /** Nur dieser Verkaufskanal, oder alle. */
  channel: SaleChannel | "alle"
}

function defaultChartPrefs(): ChartPrefs {
  return { months: 6, measure: "umsatz", shape: "gestapelt", channel: "alle" }
}

function initialIntegrations(): IntegrationState {
  return {
    simulateShopifyError: false,
    simulateSheetsError: false,
    sheetsLastSyncAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    shopifyLastSyncAt: new Date(Date.now() - 1 * 3_600_000).toISOString(),
  }
}

const DEMO_USER: CurrentUser = {
  name: "Martin Traut",
  role: "admin",
  initials: "MT",
}

/** Damit die Aktivitätsliste nicht unbegrenzt wächst. */
const MAX_ACTIVITY_ENTRIES = 500

/** Der tatsächlich gespeicherte Ausschnitt — Grundlage für `migrate`. */
type PersistedState = ReturnType<typeof freshState>

function freshState() {
  const seed = createSeedData()
  return {
    scooters: seed.scooters,
    sales: seed.sales,
    activity: seed.activity,
    importBatches: seed.importBatches,
    integrations: initialIntegrations(),
    savedMapping: null,
    user: DEMO_USER,
    sidebarCollapsed: false,
    chartPrefs: defaultChartPrefs(),
  }
}

export const useCockpitStore = create<CockpitState>()(
  persist(
    (set) => ({
      ...freshState(),

      upsertScooters: (incoming) =>
        set((state) => {
          const byId = new Map(state.scooters.map((s) => [s.id, s]))
          for (const scooter of incoming) byId.set(scooter.id, scooter)
          return { scooters: [...byId.values()] }
        }),

      patchScooter: (id, patch) =>
        set((state) => ({
          scooters: state.scooters.map((scooter) =>
            scooter.id === id
              ? { ...scooter, ...patch, updatedAt: new Date().toISOString() }
              : scooter
          ),
        })),

      updateScooter: (id, updater) =>
        set((state) => ({
          scooters: state.scooters.map((scooter) =>
            scooter.id === id
              ? { ...updater(scooter), updatedAt: new Date().toISOString() }
              : scooter
          ),
        })),

      removeScooter: (id) =>
        set((state) => ({
          scooters: state.scooters.filter((scooter) => scooter.id !== id),
        })),

      addSale: (sale) => set((state) => ({ sales: [sale, ...state.sales] })),

      patchSale: (id, patch) =>
        set((state) => ({
          sales: state.sales.map((sale) =>
            sale.id === id ? { ...sale, ...patch } : sale
          ),
        })),

      addActivity: (events) =>
        set((state) => ({
          activity: [...events, ...state.activity]
            .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
            .slice(0, MAX_ACTIVITY_ENTRIES),
        })),

      addImportBatch: (batch) =>
        set((state) => ({ importBatches: [batch, ...state.importBatches] })),

      setSavedMapping: (mapping) => set({ savedMapping: mapping }),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      setChartPrefs: (patch) =>
        set((state) => ({ chartPrefs: { ...state.chartPrefs, ...patch } })),

      setIntegrations: (patch) =>
        set((state) => ({ integrations: { ...state.integrations, ...patch } })),

      replaceAll: (data) => set({ ...data }),

      resetDemoData: () => set({ ...freshState() }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(createGuardedStorage),
      // Nur Daten persistieren, keine Funktionen.
      partialize: (state) => ({
        scooters: state.scooters,
        sales: state.sales,
        activity: state.activity,
        importBatches: state.importBatches,
        integrations: state.integrations,
        savedMapping: state.savedMapping,
        user: state.user,
        sidebarCollapsed: state.sidebarCollapsed,
        chartPrefs: state.chartPrefs,
      }),
      /**
       * Ohne `migrate` verwirft zustand einen Stand mit älterer Version
       * kommentarlos — der Nutzer säße nach einem Feldwechsel im Modell vor
       * dem frischen Beispielbestand und käme an seine Daten nicht mehr heran.
       *
       * Deshalb wird ein alter Stand aufgefüllt statt weggeworfen: Felder, die
       * es damals noch nicht gab, bekommen ihren Standardwert.
       */
      migrate: (persisted) => {
        const state = persisted as Partial<PersistedState> | undefined
        if (!state) return undefined

        const base = freshState()
        return {
          ...base,
          ...state,
          integrations: { ...base.integrations, ...state.integrations },
          user: { ...base.user, ...state.user },
          sales: (state.sales ?? []).map((sale) => ({
            ...sale,
            // Ab Version 2 mitgeführt, damit ein Wiederholungsversuch nach
            // dem Neuladen keine zweite Zeile in der Umsatztabelle anlegt.
            sheetsRowNumber: sale.sheetsRowNumber ?? null,
            // Ab Version 3: Herkunft des Kunden. Altbestände wissen sie nicht —
            // "UNBEKANNT" ist die ehrliche Antwort, nicht ein geratener Kanal.
            customerSource: sale.customerSource ?? "UNBEKANNT",
            customerRegion: sale.customerRegion ?? "",
            saleLocation: sale.saleLocation ?? "",
          })),
          scooters: state.scooters ?? base.scooters,
          activity: state.activity ?? [],
          importBatches: state.importBatches ?? [],
          sidebarCollapsed: state.sidebarCollapsed ?? false,
          chartPrefs: { ...base.chartPrefs, ...state.chartPrefs },
          savedMapping: state.savedMapping ?? null,
        }
      },
      onRehydrateStorage: () => (_state, error) => {
        if (!error) return
        reportPersistenceProblem({
          kind: "read",
          message:
            "Der gespeicherte Stand konnte nicht geladen werden. Es wird mit dem " +
            "Beispielbestand weitergearbeitet. Details: " +
            (error instanceof Error ? error.message : String(error)),
        })
      },
    }
  )
)

/* ------------------------------------------------------------------ */
/* Hydration                                                           */
/* ------------------------------------------------------------------ */

/**
 * Der Server kennt den localStorage nicht. Damit React keine
 * Hydration-Warnung wirft, warten datenabhängige Ansichten auf dieses Flag
 * und zeigen bis dahin ihre Skeleton-Zustände.
 *
 * Die Auskunft kommt direkt aus der persist-Middleware statt aus einem
 * selbstgebauten Flag — `hasHydrated()` ist auch dann korrekt, wenn die
 * Rehydrierung schon vor dem Mounten der Komponente abgeschlossen war.
 */
export function isStoreHydrated() {
  return useCockpitStore.persist.hasHydrated()
}

export function subscribeToHydration(listener: () => void) {
  return useCockpitStore.persist.onFinishHydration(listener)
}

/** Direkter Lesezugriff für das Repository (außerhalb von React). */
export function getCockpitState(): CockpitState {
  return useCockpitStore.getState()
}
