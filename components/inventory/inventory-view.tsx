"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Plus, SlidersHorizontal, X } from "lucide-react"

import { InventoryTable } from "./inventory-table"
import { NewArticleDialog } from "./new-article-dialog"
import { NewUnitDialog } from "@/components/units/new-unit-dialog"
import { FOCUS_RING } from "@/components/skope/focus"
import { InlineSelect, SearchInput } from "@/components/skope/form"
import { Metric, Panel, PageHeader } from "@/components/skope/primitives"
import { MetricGridSkeleton, TableSkeleton } from "@/components/skope/skeletons"
import { Button } from "@/components/ui/button"
import {
  useArticleViews,
  useCategories,
  useCategoryOptions,
  useCategorySettings,
  useHydrated,
  useManufacturers,
} from "@/hooks/use-cockpit"
import { subtreeIds } from "@/lib/domain/categories"
import { articleLabel } from "@/lib/domain/article-factory"
import { formatCents, formatNumber } from "@/lib/domain/money"
import { STOCK_MODES, type ArticleView, type StockMode } from "@/lib/domain/types"
import { STOCK_MODE_META } from "@/lib/domain/status"
import { cn } from "@/lib/utils"

type SortKey = "updated" | "number" | "quantity" | "value" | "name"

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "updated", label: "Zuletzt geändert" },
  { value: "quantity", label: "Bestand" },
  { value: "value", label: "Lagerwert" },
  { value: "number", label: "Artikelnummer" },
  { value: "name", label: "Bezeichnung" },
]

/**
 * Bestandsübersicht mit Suche, Filtern und Sortierung.
 *
 * Der eigentliche Nutzen steckt in den Merkmalsfiltern: Sobald ein Bereich
 * gewählt ist, erscheinen dessen als filterbar markierte Merkmale als eigene
 * Auswahl. Erst damit ist „wie viele 8,5-Zoll-Tubeless habe ich" eine Frage,
 * die das System beantwortet — und nicht eine, die man im Regal nachzählt.
 */
export function InventoryView() {
  const searchParams = useSearchParams()
  const hydrated = useHydrated()
  const views = useArticleViews()
  const categories = useCategories()
  const categoryOptions = useCategoryOptions()
  const manufacturers = useManufacturers()

  const [query, setQuery] = useState("")
  const [categoryId, setCategoryId] = useState(searchParams.get("bereich") ?? "")
  const [stockMode, setStockMode] = useState<string>(
    searchParams.get("art") ?? "alle"
  )
  const [manufacturer, setManufacturer] = useState("alle")
  const [scope, setScope] = useState<string>(searchParams.get("scope") ?? "aktiv")
  const [attributeFilters, setAttributeFilters] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<SortKey>("updated")
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [articleOpen, setArticleOpen] = useState(false)
  const [unitOpen, setUnitOpen] = useState(false)

  const settings = useCategorySettings(categoryId || null)
  const filterableAttributes = settings.attributes.filter(
    (attribute) => attribute.filterable
  )

  /** Werte, die im Bestand tatsächlich vorkommen — leere Filter helfen nicht. */
  const attributeValues = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const attribute of filterableAttributes) {
      const values = new Set<string>()
      for (const view of views) {
        const value = view.article.attributes[attribute.key]?.trim()
        if (value) values.add(value)
      }
      map.set(attribute.key, values)
    }
    return map
  }, [filterableAttributes, views])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const allowedCategories = categoryId
      ? subtreeIds(categories, categoryId)
      : null

    const result = views.filter((view) => {
      const { article, stock } = view

      if (scope === "aktiv" && article.archivedAt !== null) return false
      if (scope === "vorhanden" && stock.quantity === 0) return false
      if (scope === "leer" && stock.quantity > 0) return false
      if (scope === "meldebestand" && !stock.belowReorderLevel) return false
      if (scope === "archiviert" && article.archivedAt === null) return false

      if (allowedCategories && !allowedCategories.has(article.categoryId)) {
        return false
      }
      if (stockMode !== "alle" && article.stockMode !== stockMode) return false
      if (manufacturer !== "alle" && article.manufacturer !== manufacturer) {
        return false
      }

      for (const [key, value] of Object.entries(attributeFilters)) {
        if (!value) continue
        if ((article.attributes[key] ?? "").trim() !== value) return false
      }

      if (needle) {
        const haystack = [
          article.sku,
          article.name,
          article.manufacturer,
          article.mpn,
          article.ean,
          view.settings.pathLabel,
          ...Object.values(article.attributes),
        ]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(needle)) return false
      }

      return true
    })

    return sortViews(result, sort)
  }, [
    views,
    categories,
    query,
    categoryId,
    stockMode,
    manufacturer,
    scope,
    attributeFilters,
    sort,
  ])

  const totals = useMemo(
    () => ({
      pieces: filtered.reduce((sum, view) => sum + view.stock.quantity, 0),
      value: filtered.reduce((sum, view) => sum + view.stock.valueCents, 0),
      below: filtered.filter((view) => view.stock.belowReorderLevel).length,
    }),
    [filtered]
  )

  const activeFilters =
    (categoryId ? 1 : 0) +
    (stockMode !== "alle" ? 1 : 0) +
    (manufacturer !== "alle" ? 1 : 0) +
    (scope !== "aktiv" ? 1 : 0) +
    Object.values(attributeFilters).filter(Boolean).length

  function resetFilters() {
    setCategoryId("")
    setStockMode("alle")
    setManufacturer("alle")
    setScope("aktiv")
    setAttributeFilters({})
    setQuery("")
  }

  const controls = (stacked = false) => (
    <FilterControls
      stacked={stacked}
      categoryId={categoryId}
      setCategoryId={(value) => {
        setCategoryId(value)
        // Merkmale gehören zum Bereich; beim Wechsel würden sie sonst
        // unsichtbar weiterfiltern und die Liste bliebe unerklärlich leer.
        setAttributeFilters({})
      }}
      categoryOptions={categoryOptions}
      stockMode={stockMode}
      setStockMode={setStockMode}
      manufacturer={manufacturer}
      setManufacturer={setManufacturer}
      manufacturers={manufacturers}
      scope={scope}
      setScope={setScope}
      sort={sort}
      setSort={setSort}
    />
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bestand"
        description="Alle Artikel — Geräte, Ersatzteile und Zubehör — mit Menge, Wert und Kanalstatus."
        actions={
          <>
            <Button
              variant="outline"
              className="h-10 gap-2 px-4"
              onClick={() => setUnitOpen(true)}
            >
              <Plus className="size-4" />
              Gerät erfassen
            </Button>
            <Button className="h-10 gap-2 px-4" onClick={() => setArticleOpen(true)}>
              <Plus className="size-4" />
              Artikel anlegen
            </Button>
          </>
        }
      />

      {!hydrated ? (
        <MetricGridSkeleton count={3} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Artikel in Auswahl"
            value={formatNumber(filtered.length)}
            hint={`${formatNumber(totals.pieces)} Stück insgesamt`}
          />
          <Metric
            label="Lagerwert"
            value={formatCents(totals.value)}
            hint="Einstandswert der Auswahl"
            accent
          />
          <Metric
            label="Unter Meldebestand"
            value={totals.below}
            hint={totals.below > 0 ? "Nachbestellen prüfen" : "alles im Rahmen"}
          />
        </div>
      )}

      <Panel className="overflow-hidden">
        <div className="border-b border-skope-line p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              placeholder="Artikelnummer, Bezeichnung, Teilenummer oder Merkmal …"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 sm:max-w-sm"
              aria-label="Bestand durchsuchen"
            />

            <button
              type="button"
              onClick={() => setFiltersOpen((value) => !value)}
              aria-expanded={filtersOpen}
              className={cn(
                "flex h-11 items-center gap-2 rounded-lg border px-3 type-body-sm transition-colors lg:hidden",
                FOCUS_RING,
                activeFilters > 0
                  ? "border-skope-accent/40 bg-skope-accent/8 text-skope-accent"
                  : "border-skope-line-strong text-muted-foreground hover:text-foreground"
              )}
            >
              <SlidersHorizontal className="size-4" />
              Filter
              {activeFilters > 0 && (
                <span className="grid size-4 place-items-center rounded-full bg-skope-accent text-[11px] font-medium text-[#14100a]">
                  {activeFilters}
                </span>
              )}
            </button>

            <div className="ml-auto hidden items-center gap-2 lg:flex">
              {controls()}
            </div>
          </div>

          {filtersOpen && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:hidden">
              {controls(true)}
            </div>
          )}

          {/*
            Merkmalsfilter erscheinen erst mit gewähltem Bereich — vorher wäre
            nicht entscheidbar, welche Merkmale überhaupt gelten.
          */}
          {filterableAttributes.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-skope-line bg-surface-sunken p-2.5">
              <span className="type-label px-1">Merkmale</span>
              {filterableAttributes.map((attribute) => {
                const values = [...(attributeValues.get(attribute.key) ?? [])].sort(
                  (a, b) => a.localeCompare(b, "de", { numeric: true })
                )
                return (
                  <InlineSelect
                    key={attribute.key}
                    aria-label={attribute.label}
                    value={attributeFilters[attribute.key] ?? ""}
                    onChange={(event) =>
                      setAttributeFilters((current) => ({
                        ...current,
                        [attribute.key]: event.target.value,
                      }))
                    }
                    options={[
                      { value: "", label: `${attribute.label}: alle` },
                      ...values.map((value) => ({
                        value,
                        label: attribute.unit
                          ? `${value} ${attribute.unit}`
                          : value,
                      })),
                    ]}
                  />
                )
              })}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {filtered.length}
              </span>{" "}
              {filtered.length === 1 ? "Artikel" : "Artikel"}
              {activeFilters > 0 || query ? " gefiltert" : ""}
            </p>
            {(activeFilters > 0 || query) && (
              <button
                type="button"
                onClick={resetFilters}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground",
                  FOCUS_RING
                )}
              >
                <X className="size-3.5" />
                Filter zurücksetzen
              </button>
            )}
          </div>
        </div>

        {!hydrated ? (
          <TableSkeleton rows={8} />
        ) : (
          <InventoryTable
            views={filtered}
            emptyTitle={
              query || activeFilters > 0 ? "Keine Treffer" : "Noch kein Bestand"
            }
            emptyDescription={
              query || activeFilters > 0
                ? "Für diese Kombination aus Suche und Filtern gibt es keine Ergebnisse."
                : "Lege den ersten Artikel an oder importiere eine Lieferantenliste."
            }
            emptyAction={
              query || activeFilters > 0 ? (
                <Button
                  variant="outline"
                  className="h-10 px-4"
                  onClick={resetFilters}
                >
                  Filter zurücksetzen
                </Button>
              ) : (
                <Button className="h-10 px-4" onClick={() => setArticleOpen(true)}>
                  Artikel anlegen
                </Button>
              )
            }
          />
        )}
      </Panel>

      <NewArticleDialog
        open={articleOpen}
        onOpenChange={setArticleOpen}
        defaultCategoryId={categoryId || undefined}
      />
      <NewUnitDialog open={unitOpen} onOpenChange={setUnitOpen} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Filter                                                              */
/* ------------------------------------------------------------------ */

function FilterControls({
  stacked,
  categoryId,
  setCategoryId,
  categoryOptions,
  stockMode,
  setStockMode,
  manufacturer,
  setManufacturer,
  manufacturers,
  scope,
  setScope,
  sort,
  setSort,
}: {
  stacked?: boolean
  categoryId: string
  setCategoryId: (value: string) => void
  categoryOptions: { id: string; label: string; depth: number }[]
  stockMode: string
  setStockMode: (value: string) => void
  manufacturer: string
  setManufacturer: (value: string) => void
  manufacturers: string[]
  scope: string
  setScope: (value: string) => void
  sort: SortKey
  setSort: (value: SortKey) => void
}) {
  const width = stacked ? "w-full" : undefined

  return (
    <>
      <InlineSelect
        className={width}
        aria-label="Bereich"
        value={categoryId}
        onChange={(event) => setCategoryId(event.target.value)}
        options={[
          { value: "", label: "Alle Bereiche" },
          ...categoryOptions.map((option) => ({
            value: option.id,
            label: `${"– ".repeat(option.depth)}${option.label}`,
          })),
        ]}
      />
      <InlineSelect
        className={width}
        aria-label="Bestandsart"
        value={stockMode}
        onChange={(event) => setStockMode(event.target.value)}
        options={[
          { value: "alle", label: "Alle Arten" },
          ...STOCK_MODES.map((mode: StockMode) => ({
            value: mode,
            label: STOCK_MODE_META[mode].label,
          })),
        ]}
      />
      <InlineSelect
        className={width}
        aria-label="Bestandslage"
        value={scope}
        onChange={(event) => setScope(event.target.value)}
        options={[
          { value: "aktiv", label: "Aktive Artikel" },
          { value: "vorhanden", label: "Nur mit Bestand" },
          { value: "leer", label: "Ohne Bestand" },
          { value: "meldebestand", label: "Unter Meldebestand" },
          { value: "archiviert", label: "Archiviert" },
        ]}
      />
      <InlineSelect
        className={width}
        aria-label="Hersteller"
        value={manufacturer}
        onChange={(event) => setManufacturer(event.target.value)}
        options={[
          { value: "alle", label: "Alle Hersteller" },
          ...manufacturers.map((entry) => ({ value: entry, label: entry })),
        ]}
      />
      <InlineSelect
        className={width}
        aria-label="Sortierung"
        value={sort}
        onChange={(event) => setSort(event.target.value as SortKey)}
        options={SORT_OPTIONS}
      />
    </>
  )
}

function sortViews(views: ArticleView[], sort: SortKey): ArticleView[] {
  const sorted = [...views]

  switch (sort) {
    case "number":
      return sorted.sort((a, b) => a.article.sku.localeCompare(b.article.sku))
    case "name":
      return sorted.sort((a, b) =>
        articleLabel(a.article).localeCompare(articleLabel(b.article), "de")
      )
    case "quantity":
      return sorted.sort((a, b) => b.stock.quantity - a.stock.quantity)
    case "value":
      return sorted.sort((a, b) => b.stock.valueCents - a.stock.valueCents)
    default:
      return sorted.sort(
        (a, b) =>
          new Date(b.article.updatedAt).getTime() -
          new Date(a.article.updatedAt).getTime()
      )
  }
}
