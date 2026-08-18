"use client"

import Link from "next/link"

import { DateTimeText } from "@/components/skope/client-time"
import { EmptyState } from "@/components/skope/primitives"
import { StatusPill } from "@/components/skope/status-pill"
import { useArticles, useLocations } from "@/hooks/use-cockpit"
import { articleLabel } from "@/lib/domain/article-factory"
import { formatCents } from "@/lib/domain/money"
import { MOVEMENT_TYPE_META } from "@/lib/domain/status"
import type { StockMovement } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/**
 * Liste von Lagerbewegungen.
 *
 * Der Bestand ist die Summe genau dieser Zeilen. Deshalb steht die Menge mit
 * Vorzeichen und in Farbe da: Wer eine Abweichung sucht, liest hier von oben
 * nach unten mit und braucht dafür keine zweite Ansicht.
 */
export function MovementList({
  movements,
  showArticle = true,
  emptyTitle = "Keine Bewegungen",
  emptyDescription = "Sobald zugebucht, entnommen oder umgelagert wird, steht hier jede Buchung.",
}: {
  movements: StockMovement[]
  showArticle?: boolean
  emptyTitle?: string
  emptyDescription?: string
}) {
  const articles = useArticles()
  const locations = useLocations()

  if (movements.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  const articleById = new Map(articles.map((article) => [article.id, article]))
  const locationById = new Map(
    locations.map((location) => [location.id, location])
  )
  const locationCode = (id: string | null) =>
    id ? (locationById.get(id)?.code ?? "?") : "ohne Platz"

  return (
    <ul className="divide-y divide-skope-line">
      {movements.map((movement) => {
        const meta = MOVEMENT_TYPE_META[movement.type]
        const article = articleById.get(movement.articleId)
        const inbound = movement.quantity > 0

        return (
          <li
            key={movement.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-surface-sunken sm:px-5"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span
                className={cn(
                  "w-16 shrink-0 text-right font-mono text-sm font-medium tabular-nums",
                  movement.type === "UMLAGERUNG"
                    ? "text-muted-foreground"
                    : inbound
                      ? "text-state-ready"
                      : "text-state-error"
                )}
              >
                {movement.type === "UMLAGERUNG"
                  ? movement.quantity
                  : `${inbound ? "+" : ""}${movement.quantity}`}
              </span>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={meta.tone} size="sm" dot={false}>
                    {meta.label}
                  </StatusPill>
                  {showArticle && article && (
                    <Link
                      href={`/inventory/${article.id}`}
                      className="truncate rounded text-sm text-foreground transition-colors hover:text-skope-accent"
                    >
                      {articleLabel(article)}
                    </Link>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {movement.type === "UMLAGERUNG"
                    ? `${locationCode(movement.locationId)} → ${locationCode(movement.toLocationId)}`
                    : locationCode(movement.locationId)}
                  {movement.unitCostCents !== null &&
                    ` · ${formatCents(movement.unitCostCents)} je Stück`}
                  {movement.note && ` · ${movement.note}`}
                </p>
              </div>
            </div>

            <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
              <DateTimeText iso={movement.at} /> · {movement.actor}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
