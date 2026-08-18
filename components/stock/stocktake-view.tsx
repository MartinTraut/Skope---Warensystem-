"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ClipboardCheck } from "lucide-react"

import { InlineSelect, SearchInput } from "@/components/skope/form"
import {
  EmptyState,
  Metric,
  Panel,
  PanelHeader,
  PageHeader,
} from "@/components/skope/primitives"
import { MetricGridSkeleton, TableSkeleton } from "@/components/skope/skeletons"
import { Button } from "@/components/ui/button"
import {
  useArticleViews,
  useCategories,
  useCategoryOptions,
  useHydrated,
  useLocations,
} from "@/hooks/use-cockpit"
import { repositories } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import { subtreeIds } from "@/lib/domain/categories"
import { articleLabel } from "@/lib/domain/article-factory"
import { formatCents, formatNumber } from "@/lib/domain/money"
import { quantityAt } from "@/lib/domain/stock"
import type { ArticleView } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/**
 * Zählliste für die Inventur.
 *
 * Der Sollbestand steht daneben, aber die Differenz wird nicht stillschweigend
 * übernommen: Sie wird als Korrekturbuchung mit Begründung gebucht. Ein
 * überschreibbarer Bestand läuft sonst genauso auseinander wie die Excel-Liste,
 * die er ersetzen soll.
 */
export function StocktakeView() {
  const hydrated = useHydrated()
  const views = useArticleViews()
  const categories = useCategories()
  const categoryOptionList = useCategoryOptions()
  const locations = useLocations()

  const [query, setQuery] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [locationId, setLocationId] = useState("alle")
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [reason, setReason] = useState("Inventur")
  const [busy, setBusy] = useState(false)

  const targetLocation = locationId === "alle" ? null : locationId === "ohne" ? null : locationId
  const locationScoped = locationId !== "alle"

  const rows = useMemo(() => {
    const allowed = categoryId ? subtreeIds(categories, categoryId) : null
    const needle = query.trim().toLowerCase()

    return views
      .filter((view) => view.article.stockMode === "MENGE")
      .filter((view) => view.article.archivedAt === null)
      .filter((view) => !allowed || allowed.has(view.article.categoryId))
      .filter((view) => {
        if (!needle) return true
        return [view.article.sku, articleLabel(view.article), view.article.mpn]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      })
      .sort((a, b) => a.article.sku.localeCompare(b.article.sku))
  }, [views, categories, categoryId, query])

  const expected = (view: ArticleView) =>
    locationScoped ? quantityAt(view.stock, targetLocation) : view.stock.quantity

  const entered = rows.filter((view) => counts[view.article.id]?.trim() !== undefined && counts[view.article.id]?.trim() !== "")
  const deviations = entered.filter((view) => {
    const counted = Number.parseInt(counts[view.article.id], 10)
    return Number.isFinite(counted) && counted !== expected(view)
  })

  async function bookAll() {
    if (deviations.length === 0) return
    setBusy(true)

    let booked = 0
    for (const view of deviations) {
      const counted = Number.parseInt(counts[view.article.id], 10)
      const result = await runAction(
        repositories.stock.correct({
          articleId: view.article.id,
          countedQuantity: counted,
          locationId: targetLocation,
          reason,
        }),
        { failure: `Korrektur für ${view.article.sku} nicht gebucht` }
      )
      if (result !== null) booked += 1
    }

    setBusy(false)
    setCounts({})

    if (booked > 0) {
      // Kein pauschaler Erfolg: gemeldet wird, was tatsächlich gebucht wurde.
      const { toast } = await import("sonner")
      toast.success(`${booked} Korrektur${booked === 1 ? "" : "en"} gebucht`, {
        description: "Die Differenzen stehen als Buchung im Journal.",
      })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventur"
        description="Zählmengen eintragen und Differenzen als Korrektur buchen. Serialisierte Artikel zählt man am Gerät, nicht in dieser Liste."
        actions={
          <Button
            className="h-10 gap-2 px-4"
            disabled={deviations.length === 0 || busy}
            onClick={bookAll}
          >
            <ClipboardCheck className="size-4" />
            {busy
              ? "Wird gebucht …"
              : `${deviations.length} Differenz${deviations.length === 1 ? "" : "en"} buchen`}
          </Button>
        }
      />

      {!hydrated ? (
        <MetricGridSkeleton count={3} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Artikel in der Liste" value={formatNumber(rows.length)} />
          <Metric label="Gezählt" value={formatNumber(entered.length)} />
          <Metric
            label="Differenzen"
            value={formatNumber(deviations.length)}
            hint="werden als Korrektur gebucht"
            accent={deviations.length > 0}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="min-w-[14rem] flex-1"
          placeholder="Artikelnummer oder Bezeichnung"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
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
            { value: "alle", label: "Gesamtbestand" },
            { value: "ohne", label: "Ohne Lagerplatz" },
            ...locations.map((location) => ({
              value: location.id,
              label: `${location.code} – ${location.name}`,
            })),
          ]}
        />
      </div>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Zählliste"
          description={
            locationScoped
              ? "Gezählt wird der Bestand am gewählten Lagerplatz."
              : "Gezählt wird der Gesamtbestand über alle Plätze."
          }
          action={
            <input
              className="h-9 w-48 rounded-lg border border-skope-line bg-surface-sunken px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-skope-accent/60 focus:ring-3 focus:ring-skope-accent/15 focus:outline-none"
              placeholder="Begründung"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-label="Begründung der Korrektur"
            />
          }
        />
        {!hydrated ? (
          <TableSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Keine Mengenartikel im Filter"
            description="Die Inventur erfasst nur Artikel, die als Menge geführt werden."
          />
        ) : (
          <ul className="divide-y divide-skope-line">
            {rows.map((view) => {
              const soll = expected(view)
              const raw = counts[view.article.id] ?? ""
              const counted = Number.parseInt(raw, 10)
              const hasCount = raw.trim() !== "" && Number.isFinite(counted)
              const delta = hasCount ? counted - soll : 0

              return (
                <li
                  key={view.article.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/inventory/${view.article.id}`}
                      className="rounded font-mono text-sm text-foreground transition-colors hover:text-skope-accent"
                    >
                      {view.article.sku}
                    </Link>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {articleLabel(view.article)}
                      {` · Wert ${formatCents(view.stock.valueCents)}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="type-label">Soll</p>
                      <p className="font-mono text-sm tabular-nums text-foreground">
                        {formatNumber(soll)}
                      </p>
                    </div>
                    <div className="text-right">
                      <label className="type-label block" htmlFor={`count-${view.article.id}`}>
                        Gezählt
                      </label>
                      <input
                        id={`count-${view.article.id}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        className="mt-0.5 h-10 w-24 rounded-lg border border-skope-line bg-surface-sunken px-2.5 text-right font-mono text-sm tabular-nums text-foreground focus:border-skope-accent/60 focus:ring-3 focus:ring-skope-accent/15 focus:outline-none"
                        value={raw}
                        onChange={(event) =>
                          setCounts((current) => ({
                            ...current,
                            [view.article.id]: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="w-16 text-right">
                      <p className="type-label">Differenz</p>
                      <p
                        className={cn(
                          "font-mono text-sm tabular-nums",
                          !hasCount || delta === 0
                            ? "text-muted-foreground"
                            : delta > 0
                              ? "text-state-ready"
                              : "text-state-error"
                        )}
                      >
                        {hasCount ? (delta > 0 ? `+${delta}` : delta) : "—"}
                      </p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
