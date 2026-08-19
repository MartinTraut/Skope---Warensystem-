"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { ConditionBadge, SaleBadge, WorkflowBadge } from "@/components/shared/badges"
import { RelativeTime } from "@/components/skope/client-time"
import { EmptyState, Panel, PanelHeader } from "@/components/skope/primitives"
import { formatCents, formatKm } from "@/lib/domain/money"
import { totalCostCents } from "@/lib/domain/metrics"
import { isUnitInStock } from "@/lib/domain/stock"
import type { ArticleView } from "@/lib/domain/types"
import { FOCUS_RING } from "@/components/skope/focus"
import { cn } from "@/lib/utils"

/** Alle Geräte dieses Artikels — im Bestand und bereits abgeschlossen. */
export function TabArticleUnits({ view }: { view: ArticleView }) {
  const inStock = view.units
    .filter(isUnitInStock)
    .sort((a, b) => a.unitNumber.localeCompare(b.unitNumber))
  const closed = view.units
    .filter((unit) => !isUnitInStock(unit))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <div className="space-y-6">
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Im Bestand"
          description="Geräte dieses Modells, die noch nicht verkauft oder ausgeschlachtet sind."
        />
        {inStock.length === 0 ? (
          <EmptyState
            title="Kein Gerät im Bestand"
            description="Neue Geräte entstehen über den Wareneingang oder den Import."
          />
        ) : (
          <ul className="divide-y divide-skope-line">
            {inStock.map((unit) => (
              <li key={unit.id}>
                <Link
                  href={`/units/${unit.id}`}
                  className={cn(
                    "flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-sunken sm:px-5",
                    FOCUS_RING
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium text-foreground">
                        {unit.unitNumber}
                      </span>
                      <WorkflowBadge status={unit.workflowStatus} size="sm" />
                      <SaleBadge status={unit.saleStatus} size="sm" />
                      <ConditionBadge condition={unit.condition} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {unit.serialNumber || "ohne Seriennummer"}
                      {unit.mileageKm > 0 && ` · ${formatKm(unit.mileageKm)}`}
                      {` · Kosten ${formatCents(totalCostCents(unit))}`}
                    </p>
                  </div>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    <RelativeTime iso={unit.updatedAt} />
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {closed.length > 0 && (
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Abgeschlossen"
            description="Verkaufte und ausgeschlachtete Geräte bleiben für die Historie erhalten."
          />
          <ul className="divide-y divide-skope-line">
            {closed.map((unit) => (
              <li key={unit.id}>
                <Link
                  href={`/units/${unit.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-sunken sm:px-5"
                >
                  <span className="font-mono text-sm text-muted-foreground">
                    {unit.unitNumber}
                  </span>
                  <WorkflowBadge status={unit.workflowStatus} size="sm" />
                  <span className="ml-auto text-xs text-muted-foreground">
                    <RelativeTime iso={unit.updatedAt} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
