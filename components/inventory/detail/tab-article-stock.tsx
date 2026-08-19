"use client"

import { MovementList } from "@/components/stock/movement-list"
import { EmptyState, Metric, Panel, PanelBody, PanelHeader } from "@/components/skope/primitives"
import { useLocations, useMovements } from "@/hooks/use-cockpit"
import { formatCents, formatNumber } from "@/lib/domain/money"
import type { ArticleView } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/**
 * Bestand eines Artikels: wo er liegt und wie er zustande kam.
 *
 * Die Verteilung auf Lagerplätze steht oben, weil sie die Frage beantwortet,
 * die im Lager tatsächlich gestellt wird — „in welchem Regal?". Darunter die
 * lückenlose Buchungsfolge.
 */
export function TabArticleStock({ view }: { view: ArticleView }) {
  const { article, stock } = view
  const locations = useLocations()
  const movements = useMovements()

  const own = movements
    .filter((movement) => movement.articleId === article.id)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  const byLocation = Object.entries(stock.byLocation)
    .filter(([, quantity]) => quantity !== 0)
    .sort((a, b) => b[1] - a[1])

  const isBulk = article.stockMode === "MENGE"

  return (
    <div className="space-y-6">
      {isBulk && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Bestand"
            value={formatNumber(stock.quantity)}
            hint={
              stock.reorderLevel === null
                ? "keine Meldebestandsprüfung"
                : `Meldebestand ${stock.reorderLevel}`
            }
            accent={stock.belowReorderLevel}
          />
          <Metric
            label="Einstand ⌀"
            value={formatCents(stock.averageCostCents)}
            hint="gleitender Durchschnitt"
          />
          <Metric
            label="Lagerwert"
            value={formatCents(stock.valueCents)}
            hint="Bestand × Einstand"
          />
        </div>
      )}

      {isBulk && (
        <Panel>
          <PanelHeader
            title="Verteilung auf Lagerplätze"
            description="Der Lagerplatz hängt an der Buchung, nicht an der Artikelnummer — Umlagern ändert keine Nummer."
          />
          <PanelBody>
            {byLocation.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Derzeit kein Bestand auf einem Lagerplatz.
              </p>
            ) : (
              <ul className="space-y-2">
                {byLocation.map(([locationId, quantity]) => {
                  const location = locations.find(
                    (entry) => entry.id === locationId
                  )
                  const share =
                    stock.quantity > 0 ? (quantity / stock.quantity) * 100 : 0
                  return (
                    <li key={locationId || "ohne"}>
                      <div className="flex items-baseline justify-between gap-4 text-sm">
                        <span className="min-w-0 truncate text-foreground">
                          {location
                            ? `${location.code} – ${location.name}`
                            : "Ohne Lagerplatz"}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-foreground">
                          {formatNumber(quantity)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-track">
                        <div
                          className={cn(
                            "h-full rounded-full bg-skope-accent transition-[width] duration-base"
                          )}
                          style={{ width: `${Math.max(2, share)}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </PanelBody>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Buchungen"
          description="Jede Bestandsänderung mit Grund, Menge und Zeitpunkt."
        />
        {own.length === 0 ? (
          <EmptyState
            title="Noch keine Buchung"
            description={
              isBulk
                ? "Buche einen Zugang, um Bestand auf diesen Artikel zu legen."
                : "Bei serialisierten Artikeln entstehen Buchungen beim Erfassen und Verkaufen der Geräte."
            }
          />
        ) : (
          <MovementList movements={own} showArticle={false} />
        )}
      </Panel>
    </div>
  )
}
