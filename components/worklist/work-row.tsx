"use client"

import Link from "next/link"
import type { ReactNode } from "react"

import { ConditionBadge, WorkflowBadge } from "@/components/scooters/badges"
import { buttonVariants } from "@/components/ui/button"
import { RelativeTime } from "@/components/skope/client-time"
import { formatKm } from "@/lib/domain/money"
import { modelLabel } from "@/lib/domain/status"
import type { Scooter } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/**
 * Zeile einer Arbeitsliste (Wareneingang, Prüfung, Aufbereitung).
 *
 * Anders als in der Bestandstabelle steht hier die *nächste Handlung* im
 * Vordergrund — deshalb ein prominenter Aktionsbutton statt vieler Spalten.
 */
export function WorkRow({
  scooter,
  meta,
  action,
  warning,
}: {
  scooter: Scooter
  /** Kurzinformationen, die für diese Arbeitsliste relevant sind. */
  meta?: ReactNode
  action: ReactNode
  /** Hinweis, der die Zeile hervorhebt (z. B. fehlende Dokumente). */
  warning?: string
}) {
  return (
    <li className="px-4 py-4 transition-colors hover:bg-surface-sunken sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Link
              href={`/scooters/${scooter.id}`}
              className="rounded font-mono text-sm font-medium text-foreground transition-colors hover:text-skope-accent focus-visible:ring-3 focus-visible:ring-skope-accent/25 focus-visible:outline-none"
            >
              {scooter.scooterNumber}
            </Link>
            <WorkflowBadge status={scooter.workflowStatus} size="sm" />
            <ConditionBadge condition={scooter.condition} />
          </div>

          <p className="mt-1 truncate text-sm text-muted-foreground">
            {modelLabel(scooter)} · {formatKm(scooter.mileageKm)} ·{" "}
            {scooter.location}
          </p>

          {meta && <div className="mt-2.5">{meta}</div>}

          {warning && (
            <p className="mt-2 inline-flex rounded-md border border-state-warn/25 bg-state-warn/8 px-2 py-1 text-xs text-state-warn">
              {warning}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-xs whitespace-nowrap text-muted-foreground lg:inline">
            <RelativeTime iso={scooter.updatedAt} />
          </span>
          {action}
          <Link
            href={`/scooters/${scooter.id}`}
            className={buttonVariants({
              variant: "outline",
              className: "h-10 px-3.5",
            })}
          >
            Öffnen
          </Link>
        </div>
      </div>
    </li>
  )
}

/** Schmaler Fortschrittsbalken für Prüf- und Aufbereitungsstand. */
export function MiniProgress({
  value,
  label,
  tone = "accent",
}: {
  value: number
  label: string
  tone?: "accent" | "warn" | "ready"
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1 w-24 overflow-hidden rounded-full bg-surface-track">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            tone === "warn"
              ? "bg-state-warn"
              : tone === "ready"
                ? "bg-state-ready"
                : "bg-skope-accent"
          )}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
