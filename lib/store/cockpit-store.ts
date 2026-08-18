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
  reportPersistenceProblem
} from "./persistence-status"

import { createSeedData } from "@/lib/demo/seed"
import type {
  Article,
  ArticleUnit,
  AuditEvent,
  Category,
  ColumnMapping,
  CurrentUser,
  ImportBatch,
  IntegrationState,
  PublicationProposal,
  Sale,
  SaleChannel,
  SavedMapping,
  StockMovement,
  StorageLocation,
  Teardown
} from "@/lib/domain/types"

const STORAGE_KEY = "skope-cockpit-demo"
/*
  Version 5: Umbau vom reinen Scooter-Bestand auf das Artikel-Modell.
  Aus `scooters` werden `articles` + `units`, dazu kommen Kategorien,
  Lagerplätze, Bewegungen, Ausschlachtungen und die Freigabeliste.

  Die Zahl muss bei jeder Änderung am gespeicherten Aufbau mitwachsen —
  sonst läuft `migrate` nicht, der alte Stand wird unverändert geladen und
  die Oberfläche greift auf ein Feld zu, das es dort nie gab.
*/
const STORAGE_VERSION = 5

/** Version der Sicherungsdatei. Wandert mit dem Datenmodell mit. */
export const SNAPSHOT_VERSION = STORAGE_VERSION

export interface CockpitState {
  categories: Category[]
  locations: StorageLocation[]
  articles: Article[]
  units: ArticleUnit[]
  movements: StockMovement[]
  teardowns: Teardown[]
  proposals: PublicationProposal[]
  sales: Sale[]
  activity: AuditEvent[]
  importBatches: ImportBatch[]
  integrations: IntegrationState
  /** Zuletzt bestätigte Spalten-Mappings je Kategorie — beschleunigt Folge-Importe. */
  savedMappings: SavedMapping[]
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
  upsertCategories(categories: Category[]): void
  removeCategory(id: string): void

  upsertLocations(locations: StorageLocation[]): void
  removeLocation(id: string): void

  upsertArticles(articles: Article[]): void
  /** Änderung über eine Funktion — vermeidet Lost Updates bei Teilobjekten. */
  updateArticle(id: string, updater: (article: Article) => Article): void
  removeArticle(id: string): void

  upsertUnits(units: ArticleUnit[]): void
  updateUnit(id: string, updater: (unit: ArticleUnit) => ArticleUnit): void
  removeUnit(id: string): void

  addMovements(movements: StockMovement[]): void
  addTeardown(teardown: Teardown): void

  setProposals(proposals: PublicationProposal[]): void
  patchProposal(id: string, patch: Partial<PublicationProposal>): void

  addSale(sale: Sale): void
  patchSale(id: string, patch: Partial<Sale>): void

  addActivity(events: AuditEvent[]): void

  addImportBatch(batch: ImportBatch): void
  setSavedMapping(categoryId: string, columns: ColumnMapping[]): void

  setIntegrations(patch: Partial<IntegrationState>): void

  /** Vollständiger Austausch des Datenbestands — für das Einspielen einer Sicherung. */
  replaceAll(data: Partial<PersistedState>): void

  resetDemoData(): void
}

/** Einstellbare Ansicht der Umsatzauswertung. */
export const CHART_MEASURES = ["umsatz", "marge", "anzahl"] as const

export type ChartMeasure = (typeof CHART_MEASURES)[number]

export interface ChartPrefs {
  /** Betrachtungszeitraum in Monaten. */
  months: 3 | 6 | 12
  /**
   * Welche Größen gleichzeitig dargestellt werden. Nie leer — die erste ist
   * die Leitgröße, auf die sich Kopfzahl und Trend beziehen.
   */
  measures: ChartMeasure[]
  /** Darstellungsform. */
  shape: "gestapelt" | "balken" | "linie"
  /** Nur dieser Verkaufskanal, oder alle. */
  channel: SaleChannel | "alle"
}

function defaultChartPrefs(): ChartPrefs {
  return {
    months: 6,
    measures: ["umsatz"],
    shape: "gestapelt",
    channel: "alle"
  }
}

/**
 * Bis Version 4 konnte das Diagramm nur eine Größe zeigen (`measure`). Ein
 * gespeicherter Stand von damals wird auf die Mehrfachauswahl gehoben, statt
 * die Vorliebe stillschweigend auf den Standard zurückzusetzen.
 */
function migrateChartPrefs(
  base: ChartPrefs,
  stored: (Partial<ChartPrefs> & { measure?: ChartMeasure }) | undefined
): ChartPrefs {
  // Reihenfolge zählt: Zuerst der gespeicherte neue Wert, dann der alte
  // Einzelwert, erst zuletzt der Standard. Würde man auf das mit `base`
  // aufgefüllte Objekt prüfen, wäre `measures` immer gesetzt und die alte
  // Vorliebe ginge stillschweigend verloren.
  const { measure, ...rest } = stored ?? {}

  /*
    Der Inhalt wird geprüft, nicht nur die Länge.

    Die alte Prüfung fragte `rest.measures?.length` und ließ damit alles
    durch, was eine Länge hat — auch einen String und auch eine Kennzahl, die
    es nicht (mehr) gibt. Ein Eintrag `measures: ["gewinn"]` aus einem anderen
    Stand überlebte die Migration und ließ dann beim ersten Zugriff auf die
    Beschreibung dieser Kennzahl die gesamte Dashboard-Seite werfen. Ein
    gespeicherter Stand darf höchstens die Voreinstellung erzwingen, nie einen
    Absturz.
  */
  const isMeasure = (value: unknown): value is ChartMeasure =>
    typeof value === "string" &&
    (CHART_MEASURES as readonly string[]).includes(value)

  const validMeasures = Array.isArray(rest.measures)
    ? rest.measures.filter(isMeasure)
    : []
  const measures = validMeasures.length
    ? validMeasures
    : isMeasure(measure)
      ? [measure]
      : base.measures

  return { ...base, ...rest, measures }
}

function initialIntegrations(): IntegrationState {
  return {
    simulateShopifyError: false,
    simulateSheetsError: false,
    sheetsLastSyncAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    shopifyLastSyncAt: new Date(Date.now() - 1 * 3_600_000).toISOString()
  }
}

const DEMO_USER: CurrentUser = {
  name: "Martin Traut",
  role: "admin",
  initials: "MT"
}

/**
 * Fügt Datensätze ein oder ersetzt vorhandene — Reihenfolge bleibt erhalten.
 *
 * Ein `Map`-Umweg statt `filter` + `concat`: Bei einem Import mit mehreren
 * hundert Zeilen ist der Unterschied zwischen linear und quadratisch spürbar.
 */
function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return current
  const byId = new Map(current.map((entry) => [entry.id, entry]))
  for (const entry of incoming) byId.set(entry.id, entry)
  return [...byId.values()]
}

/** Damit die Aktivitätsliste nicht unbegrenzt wächst. */
const MAX_ACTIVITY_ENTRIES = 500

/** Der tatsächlich gespeicherte Ausschnitt — Grundlage für `migrate`. */
type PersistedState = ReturnType<typeof freshState>

function freshState() {
  const seed = createSeedData()
  return {
    categories: seed.categories,
    locations: seed.locations,
    articles: seed.articles,
    units: seed.units,
    movements: seed.movements,
    teardowns: seed.teardowns,
    proposals: seed.proposals,
    sales: seed.sales,
    activity: seed.activity,
    importBatches: seed.importBatches,
    integrations: initialIntegrations(),
    savedMappings: [] as SavedMapping[],
    user: DEMO_USER,
    sidebarCollapsed: false,
    chartPrefs: defaultChartPrefs()
  }
}

export const useCockpitStore = create<CockpitState>()(
  persist(
    (set) => ({
      ...freshState(),

      upsertCategories: (incoming) =>
        set((state) => ({ categories: mergeById(state.categories, incoming) })),

      removeCategory: (id) =>
        set((state) => ({
          categories: state.categories.filter((category) => category.id !== id)
        })),

      upsertLocations: (incoming) =>
        set((state) => ({ locations: mergeById(state.locations, incoming) })),

      removeLocation: (id) =>
        set((state) => ({
          locations: state.locations.filter((location) => location.id !== id)
        })),

      upsertArticles: (incoming) =>
        set((state) => ({ articles: mergeById(state.articles, incoming) })),

      updateArticle: (id, updater) =>
        set((state) => ({
          articles: state.articles.map((article) =>
            article.id === id
              ? { ...updater(article), updatedAt: new Date().toISOString() }
              : article
          )
        })),

      removeArticle: (id) =>
        set((state) => ({
          articles: state.articles.filter((article) => article.id !== id)
        })),

      upsertUnits: (incoming) =>
        set((state) => ({ units: mergeById(state.units, incoming) })),

      updateUnit: (id, updater) =>
        set((state) => ({
          units: state.units.map((unit) =>
            unit.id === id
              ? { ...updater(unit), updatedAt: new Date().toISOString() }
              : unit
          )
        })),

      removeUnit: (id) =>
        set((state) => ({ units: state.units.filter((unit) => unit.id !== id) })),

      addMovements: (incoming) =>
        set((state) => ({ movements: [...incoming, ...state.movements] })),

      addTeardown: (teardown) =>
        set((state) => ({ teardowns: [teardown, ...state.teardowns] })),

      setProposals: (proposals) => set({ proposals }),

      patchProposal: (id, patch) =>
        set((state) => ({
          proposals: state.proposals.map((proposal) =>
            proposal.id === id ? { ...proposal, ...patch } : proposal
          )
        })),

      addSale: (sale) => set((state) => ({ sales: [sale, ...state.sales] })),

      patchSale: (id, patch) =>
        set((state) => ({
          sales: state.sales.map((sale) =>
            sale.id === id ? { ...sale, ...patch } : sale
          )
        })),

      addActivity: (events) =>
        set((state) => ({
          activity: [...events, ...state.activity]
            .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
            .slice(0, MAX_ACTIVITY_ENTRIES)
        })),

      addImportBatch: (batch) =>
        set((state) => ({ importBatches: [batch, ...state.importBatches] })),

      setSavedMapping: (categoryId, columns) =>
        set((state) => ({
          savedMappings: [
            { categoryId, columns, updatedAt: new Date().toISOString() },
            ...state.savedMappings.filter(
              (entry) => entry.categoryId !== categoryId
            )
          ]
        })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      setChartPrefs: (patch) =>
        set((state) => ({ chartPrefs: { ...state.chartPrefs, ...patch } })),

      setIntegrations: (patch) =>
        set((state) => ({ integrations: { ...state.integrations, ...patch } })),

      replaceAll: (data) => set((state) => ({ ...state, ...data })),

      resetDemoData: () => set({ ...freshState() })
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(createGuardedStorage),
      // Nur Daten persistieren, keine Funktionen.
      partialize: (state) => ({
        categories: state.categories,
        locations: state.locations,
        articles: state.articles,
        units: state.units,
        movements: state.movements,
        teardowns: state.teardowns,
        proposals: state.proposals,
        sales: state.sales,
        activity: state.activity,
        importBatches: state.importBatches,
        integrations: state.integrations,
        savedMappings: state.savedMappings,
        user: state.user,
        sidebarCollapsed: state.sidebarCollapsed,
        chartPrefs: state.chartPrefs
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

        /*
          Version 5 hat das Datenmodell im Kern getauscht: Aus einer Liste
          `scooters` wurden Artikel und Einzelstücke. Ein Stand von vorher
          lässt sich nicht sinnvoll hochrechnen — die Zuordnung zu Bereichen,
          Nummernkreisen und Merkmalsfeldern existierte dort schlicht nicht.

          Statt zu raten wird auf den Beispielbestand zurückgesetzt und der
          Grund benannt. Ein stillschweigend halb übernommener Bestand wäre
          das schlechtere Ergebnis: Er sähe echt aus und wäre es nicht.
        */
        if (!Array.isArray(state.articles)) {
          reportPersistenceProblem({
            kind: "read",
            message:
              "Der gespeicherte Stand stammt aus der Scooter-Fassung des Cockpits " +
              "und lässt sich nicht auf das neue Artikel-Modell übertragen. Es wird " +
              "mit dem Beispielbestand weitergearbeitet."
          })
          return base
        }

        return {
          ...base,
          ...state,
          integrations: { ...base.integrations, ...state.integrations },
          user: { ...base.user, ...state.user },
          sales: (state.sales ?? []).map((sale) => ({
            ...sale,
            sheetsRowNumber: sale.sheetsRowNumber ?? null,
            customerSource: sale.customerSource ?? "UNBEKANNT",
            customerRegion: sale.customerRegion ?? "",
            saleLocation: sale.saleLocation ?? ""
          })),
          categories: state.categories ?? base.categories,
          locations: state.locations ?? base.locations,
          units: state.units ?? [],
          movements: state.movements ?? [],
          teardowns: state.teardowns ?? [],
          proposals: state.proposals ?? [],
          activity: state.activity ?? [],
          importBatches: state.importBatches ?? [],
          sidebarCollapsed: state.sidebarCollapsed ?? false,
          chartPrefs: migrateChartPrefs(base.chartPrefs, state.chartPrefs),
          savedMappings: state.savedMappings ?? []
        }
      },
      onRehydrateStorage: () => (_state, error) => {
        if (!error) return
        reportPersistenceProblem({
          kind: "read",
          message:
            "Der gespeicherte Stand konnte nicht geladen werden. Es wird mit dem " +
            "Beispielbestand weitergearbeitet. Details: " +
            (error instanceof Error ? error.message : String(error))
        })
      }
    }
  )
)

/* ------------------------------------------------------------------ */
/* Mehrere Tabs                                                        */
/* ------------------------------------------------------------------ */

/**
 * Zweiter Tab, gleicher Bestand.
 *
 * Der gesamte Zustand liegt unter einem festen Schlüssel im localStorage und
 * wird bei jedem Schreibvorgang komplett überschrieben. Ohne Abgleich gilt:
 * Wer zuletzt speichert, gewinnt — Tab A bucht einen Verkauf, Tab B sichert
 * danach irgendeine Kleinigkeit auf Basis seines Morgenstands, und der
 * Verkauf ist weg. Ohne Fehlermeldung, denn aus Sicht beider Tabs hat alles
 * funktioniert.
 *
 * Das `storage`-Ereignis feuert ausschließlich in den *anderen* Tabs, also
 * genau dort, wo der veraltete Stand liegt. Wir laden ihn neu, bevor er
 * etwas überschreiben kann. Das schließt kein gleichzeitiges Schreiben in
 * derselben Millisekunde aus — dafür braucht es die Datenbank —, beseitigt
 * aber den Fall, der im Alltag tatsächlich auftritt: zwei offene Tabs über
 * Stunden hinweg.
 */
function watchOtherTabs(): void {
  if (typeof window === "undefined") return

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return
    // `newValue === null` heißt: Der Schlüssel wurde gelöscht (Cache geleert).
    // Auch dann ist der eigene Stand nicht mehr die Wahrheit.
    void useCockpitStore.persist.rehydrate()
  })
}

watchOtherTabs()

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
