"use client"

/**
 * Lesezugriff für Komponenten.
 *
 * Schreiben läuft über `repositories` (Repository-Pattern), Lesen über diese
 * Hooks. Damit greift keine Komponente direkt auf den Store oder gar auf
 * Mock-Arrays zu, und der Austausch der Datenquelle bleibt lokal.
 *
 * Abgeleitete Größen — Bestände, Kategoriepfade, Kennzahlen — werden hier
 * einmal berechnet und nicht in den Ansichten. Sonst rechnet jede Ansicht
 * anders, und "Bestand" bedeutet an zwei Stellen zwei verschiedene Zahlen.
 */

import { useMemo, useSyncExternalStore } from "react"

import { articleLabel } from "@/lib/domain/article-factory"
import {
  categoryOptions,
  categoryPathLabel,
  resolveCategorySettings,
  subtreeIds,
} from "@/lib/domain/categories"
import {
  computeCapitalByStage,
  computeCategoryStock,
  computeChannelShares,
  computeDashboardMetrics,
  computeMonthlyRevenue,
  computePipeline,
  computeSalesMetrics,
  computeSlowMovers,
  filterSalesThisMonth,
} from "@/lib/domain/metrics"
import {
  evaluateArticleReadiness,
  evaluateUnitReadiness,
  resolveChannel,
  resolvePublishMode,
} from "@/lib/domain/publishing"
import {
  computeStockLevels,
  emptyStockLevel,
  isUnitInStock,
} from "@/lib/domain/stock"
import type {
  Article,
  ArticleUnit,
  ArticleView,
  Category,
  StockLevel,
} from "@/lib/domain/types"
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
/* Rohdaten                                                            */
/* ------------------------------------------------------------------ */

export function useCategories(): Category[] {
  return useCockpitStore((state) => state.categories)
}

export function useLocations() {
  return useCockpitStore((state) => state.locations)
}

export function useArticles(): Article[] {
  return useCockpitStore((state) => state.articles)
}

export function useUnits(): ArticleUnit[] {
  return useCockpitStore((state) => state.units)
}

export function useMovements() {
  return useCockpitStore((state) => state.movements)
}

export function useTeardowns() {
  return useCockpitStore((state) => state.teardowns)
}

export function useProposals() {
  return useCockpitStore((state) => state.proposals)
}

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

export function useSavedMapping(categoryId: string | null) {
  const mappings = useCockpitStore((state) => state.savedMappings)
  return categoryId
    ? (mappings.find((entry) => entry.categoryId === categoryId) ?? null)
    : null
}

export function useCurrentUser() {
  return useCockpitStore((state) => state.user)
}

/* ------------------------------------------------------------------ */
/* Bestände                                                            */
/* ------------------------------------------------------------------ */

/**
 * Bestände aller Artikel.
 *
 * `useMemo` ist hier kein Feinschliff: Ohne ihn liefe die Buchungsrechnung
 * bei jedem Tastendruck in einem Suchfeld erneut über alle Bewegungen.
 */
export function useStockLevels(): Map<string, StockLevel> {
  const articles = useArticles()
  const units = useUnits()
  const movements = useMovements()
  const categories = useCategories()

  return useMemo(
    () => computeStockLevels({ articles, units, movements, categories }),
    [articles, units, movements, categories]
  )
}

export function useStockLevel(articleId: string | undefined): StockLevel {
  const levels = useStockLevels()
  if (!articleId) return emptyStockLevel("")
  return levels.get(articleId) ?? emptyStockLevel(articleId)
}

/* ------------------------------------------------------------------ */
/* Zusammengesetzte Sichten                                            */
/* ------------------------------------------------------------------ */

/** Artikel mit Bestand, Kategorie-Einstellungen und zugehörigen Geräten. */
export function useArticleViews(): ArticleView[] {
  const articles = useArticles()
  const units = useUnits()
  const categories = useCategories()
  const levels = useStockLevels()

  return useMemo(() => {
    const unitsByArticle = new Map<string, ArticleUnit[]>()
    for (const unit of units) {
      const list = unitsByArticle.get(unit.articleId)
      if (list) list.push(unit)
      else unitsByArticle.set(unit.articleId, [unit])
    }

    return articles.map((article) => {
      const own = unitsByArticle.get(article.id) ?? []
      return {
        article,
        settings: resolveCategorySettings(categories, article.categoryId),
        stock: levels.get(article.id) ?? emptyStockLevel(article.id),
        units: own,
        unitsInStock: own.filter(isUnitInStock),
      }
    })
  }, [articles, units, categories, levels])
}

export function useArticleView(id: string | undefined): ArticleView | undefined {
  const views = useArticleViews()
  return id ? views.find((view) => view.article.id === id) : undefined
}

export function useArticle(id: string | undefined): Article | undefined {
  return useCockpitStore((state) =>
    id ? state.articles.find((article) => article.id === id) : undefined
  )
}

export function useUnit(id: string | undefined): ArticleUnit | undefined {
  return useCockpitStore((state) =>
    id ? state.units.find((unit) => unit.id === id) : undefined
  )
}

/** Nur die Geräte, die noch im Bestand sind. */
export function useUnitsInStock(): ArticleUnit[] {
  const units = useUnits()
  return useMemo(() => units.filter(isUnitInStock), [units])
}

/** Einstellungen einer Kategorie inklusive Vererbung. */
export function useCategorySettings(categoryId: string | null | undefined) {
  const categories = useCategories()
  return useMemo(
    () => resolveCategorySettings(categories, categoryId ?? null),
    [categories, categoryId]
  )
}

export function useCategoryOptions() {
  const categories = useCategories()
  return useMemo(() => categoryOptions(categories), [categories])
}

/** Beschriftung eines Kategoriepfads, z. B. "Ersatzteile › Elektrik". */
export function useCategoryLabel(categoryId: string | null | undefined): string {
  const categories = useCategories()
  return useMemo(
    () => categoryPathLabel(categories, categoryId ?? null),
    [categories, categoryId]
  )
}

/** Filtert Artikel auf einen Bereich inklusive aller Unterbereiche. */
export function useSubtreeFilter(categoryId: string | null) {
  const categories = useCategories()
  return useMemo(() => {
    if (!categoryId) return null
    return subtreeIds(categories, categoryId)
  }, [categories, categoryId])
}

/* ------------------------------------------------------------------ */
/* Bereitschaft und Kanäle                                             */
/* ------------------------------------------------------------------ */

export function useUnitReadiness(unit: ArticleUnit | undefined) {
  const article = useArticle(unit?.articleId)
  const settings = useCategorySettings(article?.categoryId)
  return useMemo(
    () => (unit ? evaluateUnitReadiness(unit, settings) : []),
    [unit, settings]
  )
}

export function useArticleReadiness(view: ArticleView | undefined) {
  return useMemo(
    () =>
      view ? evaluateArticleReadiness(view.article, view.stock, view.settings) : [],
    [view]
  )
}

/** Welcher Kanal und welche Automatikstufe gelten für diesen Artikel? */
export function useChannelRouting(article: Article | undefined) {
  const settings = useCategorySettings(article?.categoryId)
  return useMemo(() => {
    if (!article) return { channel: null, mode: "VORSCHLAG" as const }
    return {
      channel: resolveChannel(article, settings),
      mode: resolvePublishMode(article, settings),
    }
  }, [article, settings])
}

export function useOpenProposals() {
  const proposals = useProposals()
  return useMemo(
    () => proposals.filter((proposal) => proposal.status === "OFFEN"),
    [proposals]
  )
}

/* ------------------------------------------------------------------ */
/* Abgeleitete Kennzahlen                                              */
/* ------------------------------------------------------------------ */

export function useDashboardMetrics() {
  const articles = useArticles()
  const units = useUnits()
  const levels = useStockLevels()
  const sales = useSales()
  const openProposals = useOpenProposals()

  return useMemo(
    () =>
      computeDashboardMetrics({
        articles,
        units,
        levels,
        sales,
        openProposals: openProposals.length,
      }),
    [articles, units, levels, sales, openProposals.length]
  )
}

export function usePipeline() {
  const units = useUnits()
  const sales = useSales()
  return useMemo(() => computePipeline(units, sales), [units, sales])
}

/**
 * Einstellungen der Dashboard-Auswertung, gelesen und geschrieben.
 *
 * Ausnahmsweise auch schreibend hier: Es geht um eine reine Ansichtsvorliebe,
 * nicht um Geschäftsdaten — die laufen weiterhin ausschließlich über die
 * Repositories.
 */
export function useChartPrefs() {
  const prefs = useCockpitStore((state) => state.chartPrefs)
  const setPrefs = useCockpitStore((state) => state.setChartPrefs)
  return [prefs, setPrefs] as const
}

/** Umsatz und Marge der letzten Monate — Zeitreihe für das Dashboard. */
export function useMonthlyRevenue(months = 6) {
  const sales = useSales()
  return useMemo(() => computeMonthlyRevenue(sales, months), [sales, months])
}

/** Umsatzanteile je Verkaufskanal, absteigend. */
export function useChannelShares() {
  const sales = useSales()
  return useMemo(() => computeChannelShares(sales), [sales])
}

/** Gebundenes Kapital je Prozessstufe. */
export function useCapitalByStage() {
  const units = useUnits()
  return useMemo(() => computeCapitalByStage(units), [units])
}

/** Bestand und Lagerwert je Bereich. */
export function useCategoryStock() {
  const articles = useArticles()
  const levels = useStockLevels()
  const categories = useCategories()

  return useMemo(
    () =>
      computeCategoryStock(articles, levels, (categoryId) =>
        categoryPathLabel(categories, categoryId)
      ),
    [articles, levels, categories]
  )
}

/** Was am längsten liegt und wie viel Kapital darin steckt. */
export function useSlowMovers(minDays = 60, limit = 8) {
  const articles = useArticles()
  const units = useUnits()
  const levels = useStockLevels()

  return useMemo(
    () =>
      computeSlowMovers(articles, units, levels, articleLabel, { minDays, limit }),
    [articles, units, levels, minDays, limit]
  )
}

/** Artikel unter ihrem Meldebestand — die Nachbestell-Liste. */
export function useBelowReorderLevel() {
  const views = useArticleViews()
  return useMemo(
    () =>
      views
        .filter(
          (view) =>
            view.article.archivedAt === null && view.stock.belowReorderLevel
        )
        .sort((a, b) => a.stock.quantity - b.stock.quantity),
    [views]
  )
}

export function useSalesMetrics(scope: "month" | "all" = "month") {
  const sales = useSales()
  return useMemo(
    () =>
      computeSalesMetrics(scope === "month" ? filterSalesThisMonth(sales) : sales),
    [sales, scope]
  )
}

/** Eindeutige Herstellerliste für Filter — immer alphabetisch. */
export function useManufacturers(): string[] {
  const articles = useArticles()
  return useMemo(
    () =>
      [...new Set(articles.map((article) => article.manufacturer).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "de")
      ),
    [articles]
  )
}

/* ------------------------------------------------------------------ */
/* Nachschlagen                                                        */
/* ------------------------------------------------------------------ */

/**
 * Artikel und Lagerplatz zu einem Gerät.
 *
 * Arbeitslisten zeigen zu jedem Gerät die Modellbezeichnung und den
 * Lagerplatz. Ohne diesen gebündelten Zugriff würde jede Zeile einzeln durch
 * beide Listen suchen — bei ein paar hundert Geräten ist das der Unterschied
 * zwischen flüssig und zäh.
 */
export function useUnitLookup() {
  const articles = useArticles()
  const locations = useLocations()

  return useMemo(() => {
    const byArticle = new Map(articles.map((article) => [article.id, article]))
    const byLocation = new Map(
      locations.map((location) => [location.id, location])
    )

    return {
      article: (unit: ArticleUnit) => byArticle.get(unit.articleId),
      locationCode: (unit: ArticleUnit) =>
        unit.locationId ? byLocation.get(unit.locationId)?.code : undefined,
      label: (unit: ArticleUnit) => {
        const article = byArticle.get(unit.articleId)
        return article ? articleLabel(article) : "Unbekannter Artikel"
      },
    }
  }, [articles, locations])
}
