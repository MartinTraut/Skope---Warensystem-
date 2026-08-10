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
import { persist } from "zustand/middleware"

import { createSeedData } from "@/lib/demo/seed"
import type {
  AuditEvent,
  ColumnMapping,
  CurrentUser,
  ImportBatch,
  IntegrationState,
  Sale,
  Scooter,
} from "@/lib/domain/types"

const STORAGE_KEY = "skope-cockpit-demo"
const STORAGE_VERSION = 1

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

  resetDemoData(): void
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

      setIntegrations: (patch) =>
        set((state) => ({ integrations: { ...state.integrations, ...patch } })),

      resetDemoData: () => set({ ...freshState() }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
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
      }),
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
