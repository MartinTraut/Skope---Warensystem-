"use client"

import { useMemo, useState } from "react"

import { MovementList } from "./movement-list"
import { InlineSelect, SearchInput } from "@/components/skope/form"
import { Metric, Panel, PageHeader } from "@/components/skope/primitives"
import { MetricGridSkeleton, ListSkeleton } from "@/components/skope/skeletons"
import {
  useArticles,
  useCategoryOptions,
  useCategories,
  useHydrated,
  useLocations,
  useMovements,
} from "@/hooks/use-cockpit"
import { subtreeIds } from "@/lib/domain/categories"
import { articleLabel } from "@/lib/domain/article-factory"
import { formatNumber } from "@/lib/domain/money"
import { MOVEMENT_TYPE_META } from "@/lib/domain/status"
import { MOVEMENT_TYPES } from "@/lib/domain/types"

const PERIODS = [
  { value: "alle", label: "Gesamter Zeitraum" },
  { value: "7", label: "Letzte 7 Tage" },
  { value: "30", label: "Letzte 30 Tage" },
  { value: "90", label: "Letzte 90 Tage" },
]

/**
 * Das Bestandsjournal.
 *
 * Die Ansicht, in der eine Abweichung gefunden wird: Wenn die Zählung nicht
 * zum System passt, steht die Ursache in genau einer dieser Zeilen. Deshalb
 * gibt es Filter nach Art, Bereich und Platz — aber keine Bearbeitung.
 */
export function MovementsView() {
  const hydrated = useHydrated()
  const movements = useMovements()
  const articles = useArticles()
  const categories = useCategories()
  const categoryOptionList = useCategoryOptions()
  const locations = useLocations()

  const [query, setQuery] = useState("")
  const [type, setType] = useState("alle")
  const [categoryId, setCategoryId] = useState("")
  const [locationId, setLocationId] = useState("alle")
  /*
    Der Zeitbezug wird beim Setzen des Filters festgehalten, nicht beim
    Rendern ermittelt — ein Renderdurchlauf muss reproduzierbar bleiben.
  */
  const [period, setPeriod] = useState<{ key: string; anchor: number }>({
    key: "alle",
    anchor: 0,
  })

  const filtered = useMemo(() => {
    const articleById = new Map(articles.map((article) => [article.id, article]))
    const allowed = categoryId ? subtreeIds(categories, categoryId) : null
    const since =
      period.key === "alle"
        ? null
        : period.anchor - Number.parseInt(period.key, 10) * 86_400_000
    const needle = query.trim().toLowerCase()

    return movements
      .filter((movement) => {
        if (type !== "alle" && movement.type !== type) return false
        if (since !== null && new Date(movement.at).getTime() < since) return false

        if (locationId !== "alle") {
          const target = locationId === "ohne" ? null : locationId
          if (movement.locationId !== target && movement.toLocationId !== target) {
            return false
          }
        }

        const article = articleById.get(movement.articleId)
        if (allowed && (!article || !allowed.has(article.categoryId))) return false

        if (needle) {
          const haystack = [
            article ? articleLabel(article) : "",
            article?.sku ?? "",
            movement.note,
          ]
            .join(" ")
            .toLowerCase()
          if (!haystack.includes(needle)) return false
        }

        return true
      })
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [movements, articles, categories, type, categoryId, locationId, period, query])

  const inbound = filtered
    .filter((movement) => movement.quantity > 0 && movement.type !== "UMLAGERUNG")
    .reduce((sum, movement) => sum + movement.quantity, 0)
  const outbound = filtered
    .filter((movement) => movement.quantity < 0 && movement.type !== "UMLAGERUNG")
    .reduce((sum, movement) => sum + Math.abs(movement.quantity), 0)
  const corrections = filtered.filter(
    (movement) => movement.type === "KORREKTUR"
  ).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bewegungen"
        description="Jede Bestandsänderung mit Grund, Menge und Verantwortlichem. Der Bestand ist die Summe dieser Buchungen — nachträglich ändern lässt sich hier nichts."
      />

      {!hydrated ? (
        <MetricGridSkeleton count={4} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Buchungen" value={formatNumber(filtered.length)} hint="im gewählten Zeitraum" />
          <Metric label="Zugang" value={formatNumber(inbound)} hint="Stück" />
          <Metric label="Abgang" value={formatNumber(outbound)} hint="Stück" />
          <Metric
            label="Korrekturen"
            value={formatNumber(corrections)}
            hint="Differenzen aus der Inventur"
            accent={corrections > 0}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="min-w-[14rem] flex-1"
          placeholder="Artikel, Nummer oder Notiz"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <InlineSelect
          aria-label="Zeitraum"
          value={period.key}
          onChange={(event) =>
            setPeriod({ key: event.target.value, anchor: Date.now() })
          }
          options={PERIODS}
        />
        <InlineSelect
          value={type}
          onChange={(event) => setType(event.target.value)}
          options={[
            { value: "alle", label: "Alle Arten" },
            ...MOVEMENT_TYPES.map((entry) => ({
              value: entry,
              label: MOVEMENT_TYPE_META[entry].label,
            })),
          ]}
        />
        <InlineSelect
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          options={[
            { value: "", label: "Alle Bereiche" },
            ...categoryOptionList.map((option) => ({
              value: option.id,
              label: `${"· ".repeat(option.depth)}${option.label}`,
            })),
          ]}
        />
        <InlineSelect
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          options={[
            { value: "alle", label: "Alle Lagerplätze" },
            { value: "ohne", label: "Ohne Lagerplatz" },
            ...locations.map((location) => ({
              value: location.id,
              label: `${location.code} – ${location.name}`,
            })),
          ]}
        />
      </div>

      <Panel className="overflow-hidden">
        {!hydrated ? (
          <ListSkeleton rows={8} />
        ) : (
          <MovementList
            movements={filtered}
            emptyTitle="Keine Buchung im Filter"
            emptyDescription="Weite den Zeitraum aus oder setze die Filter zurück."
          />
        )}
      </Panel>
    </div>
  )
}
