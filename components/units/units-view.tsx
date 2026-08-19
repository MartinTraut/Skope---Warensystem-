"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Boxes, Download } from "lucide-react"

import { InlineSelect, SearchInput } from "@/components/skope/form"
import { FOCUS_RING } from "@/components/skope/focus"
import {
  EmptyState,
  Metric,
  Panel,
  PanelHeader,
  PageHeader,
} from "@/components/skope/primitives"
import { SaleBadge, WorkflowBadge } from "@/components/shared/badges"
import { ListSkeleton, MetricGridSkeleton } from "@/components/skope/skeletons"
import { Button } from "@/components/ui/button"
import {
  useArticles,
  useCategories,
  useHydrated,
  useLocations,
  useUnits,
} from "@/hooks/use-cockpit"
import { unitLabel } from "@/lib/domain/article-factory"
import { resolveCategorySettings, subtreeIds } from "@/lib/domain/categories"
import { csvFileName, downloadCsv, unitsCsv } from "@/lib/domain/export-csv"
import { formatCents, formatNumber } from "@/lib/domain/money"
import { normalizeReference } from "@/lib/domain/numbering"
import { isUnitInStock } from "@/lib/domain/stock"
import { WORKFLOW_META } from "@/lib/domain/status"
import { WORKFLOW_STATUSES, type WorkflowStatus } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/**
 * Geräteliste.
 *
 * Es gab bisher keine. Einzelstücke fand man nur über den Artikel, dem sie
 * gehören, oder über eine der Arbeitslisten (Wareneingang, Prüfung,
 * Aufbereitung) — und die zeigen jeweils nur ihren Ausschnitt. Wer am Telefon
 * gefragt wurde „haben Sie das Gerät mit der Nummer 4711 noch?", hatte keinen
 * Ort, an dem er nachsehen konnte.
 *
 * Die Suche vergleicht normalisiert: „SN-1234", „sn 1234" und „SN1234" meinen
 * dasselbe Gerät. Genauso arbeitet der Import, wenn er Dubletten erkennt.
 */
export function UnitsView() {
  const hydrated = useHydrated()
  const units = useUnits()
  const articles = useArticles()
  const categories = useCategories()
  const locations = useLocations()

  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<WorkflowStatus | "alle" | "bestand">(
    "bestand"
  )
  const [categoryId, setCategoryId] = useState("")

  const articleById = useMemo(
    () => new Map(articles.map((article) => [article.id, article])),
    [articles]
  )
  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations]
  )

  const rows = useMemo(() => {
    const allowed = categoryId ? subtreeIds(categories, categoryId) : null
    const needle = query.trim()
    const normalized = normalizeReference(needle)

    return units
      .filter((unit) => {
        if (status === "alle") return true
        if (status === "bestand") return isUnitInStock(unit)
        return unit.workflowStatus === status
      })
      .filter((unit) => {
        if (!allowed) return true
        const article = articleById.get(unit.articleId)
        return article ? allowed.has(article.categoryId) : false
      })
      .filter((unit) => {
        if (!needle) return true
        const article = articleById.get(unit.articleId)
        // Seriennummer normalisiert, alles andere als Text: Nach „Kalle"
        // sucht man mit Leerzeichen, nach einer Seriennummer ohne.
        if (normalized && normalizeReference(unit.serialNumber).includes(normalized)) {
          return true
        }
        return [
          unit.unitNumber,
          article ? unitLabel(article, unit) : "",
          article?.sku ?? "",
          unit.variant,
          unit.color,
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle.toLowerCase())
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [units, articleById, categories, categoryId, query, status])

  const inStock = rows.filter(isUnitInStock)
  const stockValue = inStock.reduce(
    (sum, unit) => sum + unit.purchasePriceCents + unit.additionalCostsCents,
    0
  )

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((category) => category.stockMode === "SERIALISIERT")
        .map((category) => ({
          value: category.id,
          label: resolveCategorySettings(categories, category.id).pathLabel,
        })),
    [categories]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Geräte"
        description="Jedes einzeln geführte Stück mit Seriennummer, Status und Lagerplatz."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                csvFileName("geraete"),
                unitsCsv(rows, articles, categories, locations)
              )
            }
            disabled={rows.length === 0}
          >
            <Download className="size-4" />
            Als Tabelle
          </Button>
        }
      />

      {!hydrated ? (
        <MetricGridSkeleton count={3} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Geräte in der Auswahl" value={formatNumber(rows.length)} />
          <Metric label="Davon im Bestand" value={formatNumber(inStock.length)} />
          <Metric
            label="Einstandswert"
            value={formatCents(stockValue)}
            accent
          />
        </div>
      )}

      <Panel>
        <PanelHeader
          title={`${rows.length} Gerät${rows.length === 1 ? "" : "e"}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                className="w-full sm:w-72"
                placeholder="Seriennummer, Stücknummer, Modell"
                aria-label="Geräte durchsuchen"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <InlineSelect
                aria-label="Status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as WorkflowStatus | "alle" | "bestand")
                }
                options={[
                  { value: "bestand", label: "Im Bestand" },
                  { value: "alle", label: "Alle Geräte" },
                  ...WORKFLOW_STATUSES.map((entry) => ({
                    value: entry,
                    label: WORKFLOW_META[entry].label,
                  })),
                ]}
              />
              {categoryOptions.length > 1 && (
                <InlineSelect
                  aria-label="Bereich"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  options={[
                    { value: "", label: "Alle Bereiche" },
                    ...categoryOptions,
                  ]}
                />
              )}
            </div>
          }
        />

        {!hydrated ? (
          <ListSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Boxes className="size-5" />}
            title="Kein Gerät gefunden"
            description={
              query
                ? "Weder Seriennummer noch Stücknummer oder Modell passen zur Suche."
                : "In dieser Auswahl steht kein Gerät. Neue Geräte entstehen im Wareneingang oder über den Import."
            }
          />
        ) : (
          <ul className="divide-y divide-skope-line">
            {rows.map((unit) => {
              const article = articleById.get(unit.articleId)
              const location = unit.locationId
                ? locationById.get(unit.locationId)
                : undefined

              return (
                <li key={unit.id}>
                  <Link
                    href={`/units/${unit.id}`}
                    className={cn(
                      "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-surface-sunken sm:px-5",
                      FOCUS_RING
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm text-skope-accent">
                        {unit.unitNumber}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-foreground">
                        {article ? unitLabel(article, unit) : "Ohne Artikel"}
                      </p>
                      {unit.serialNumber && (
                        <p className="mt-0.5 truncate font-mono type-micro text-muted-foreground">
                          {unit.serialNumber}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <WorkflowBadge status={unit.workflowStatus} />
                      <SaleBadge status={unit.saleStatus} />
                    </div>

                    <div className="w-24 shrink-0 text-right">
                      <p className="type-label">Platz</p>
                      <p className="truncate font-mono text-sm text-foreground">
                        {location?.code ?? "—"}
                      </p>
                    </div>

                    <div className="w-28 shrink-0 text-right">
                      <p className="type-label">Einstand</p>
                      <p className="font-mono text-sm tabular-nums text-foreground">
                        {formatCents(
                          unit.purchasePriceCents + unit.additionalCostsCents
                        )}
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
