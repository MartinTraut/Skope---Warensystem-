"use client"

import Link from "next/link"
import { AlertTriangle, ClipboardCheck } from "lucide-react"

import { MiniProgress, WorkRow } from "./work-row"
import {
  EmptyState,
  Metric,
  Panel,
  PanelHeader,
  PageHeader,
} from "@/components/skope/primitives"
import { MetricGridSkeleton, TableSkeleton } from "@/components/skope/skeletons"
import { buttonVariants } from "@/components/ui/button"
import { getInspectionProgress } from "@/lib/domain/inspection"
import {
  useHydrated,
  useUnitLookup,
  useUnitsInStock,
} from "@/hooks/use-cockpit"
import type { ArticleUnit } from "@/lib/domain/types"

/** Arbeitsliste Prüfung: was ist offen, was ist angefangen, was hat Mängel. */
export function InspectionView() {
  const hydrated = useHydrated()
  const units = useUnitsInStock()
  const lookup = useUnitLookup()

  const open = units.filter(
    (unit) =>
      unit.inspection.completedAt === null &&
      unit.workflowStatus !== "ARCHIVIERT"
  )
  const started = open.filter(
    (unit) => getInspectionProgress(unit.inspection).checked > 0
  )
  const withProblems = units.filter(
    (unit) => getInspectionProgress(unit.inspection).problems > 0
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prüfung"
        description="Alle Geräte mit offenem Prüfprotokoll — sortiert nach Fortschritt."
      />

      {!hydrated ? (
        <MetricGridSkeleton count={3} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Offene Prüfungen"
            value={open.length}
            hint="Protokoll nicht abgeschlossen"
            icon={<ClipboardCheck className="size-4" />}
            accent={open.length > 0}
          />
          <Metric
            label="Bereits begonnen"
            value={started.length}
            hint="mindestens ein Punkt bewertet"
          />
          <Metric
            label="Mit Mängeln"
            value={withProblems.length}
            hint="Reparatur erforderlich"
          />
        </div>
      )}

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Offene Prüfprotokolle"
          description="Begonnene Prüfungen stehen oben."
        />
        {!hydrated ? (
          <TableSkeleton rows={5} />
        ) : open.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="size-5" />}
            title="Keine offenen Prüfungen"
            description="Alle Geräte im Bestand sind geprüft. Neue Prüfungen entstehen automatisch mit dem nächsten Wareneingang."
            action={
              <Link
                href="/inbound"
                className={buttonVariants({
                  variant: "outline",
                  className: "h-10 px-4",
                })}
              >
                Zum Wareneingang
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-skope-line">
            {sortByProgress(open).map((unit) => {
              const progress = getInspectionProgress(unit.inspection)
              return (
                <WorkRow
                  key={unit.id}
                  unit={unit}
                  article={lookup.article(unit)}
                  locationCode={lookup.locationCode(unit)}
                  meta={
                    <MiniProgress
                      value={progress.percent}
                      tone={progress.problems > 0 ? "warn" : "accent"}
                      label={`${progress.checked} / ${progress.total} geprüft${
                        progress.problems > 0
                          ? ` · ${progress.problems} mit Problem`
                          : ""
                      }`}
                    />
                  }
                  action={
                    <Link
                      href={`/units/${unit.id}`}
                      className={buttonVariants({ className: "h-10 px-3.5" })}
                    >
                      {progress.checked > 0 ? "Fortsetzen" : "Prüfen"}
                    </Link>
                  }
                />
              )
            })}
          </ul>
        )}
      </Panel>

      {withProblems.length > 0 && (
        <Panel tone="warn" className="overflow-hidden">
          <PanelHeader
            tone="warn"
            icon={<AlertTriangle className="size-4" />}
            title="Dokumentierte Mängel"
            description="Diese Geräte brauchen eine Reparatur, bevor sie freigegeben werden können."
            action={
              <span className="rounded-full border border-state-warn/30 bg-state-warn/12 px-3 py-1 text-sm font-medium tabular-nums text-state-warn">
                {withProblems.length}{" "}
                {withProblems.length === 1 ? "Gerät" : "Geräte"}
              </span>
            }
          />
          <ul className="divide-y divide-skope-line">
            {withProblems.map((unit) => {
              const progress = getInspectionProgress(unit.inspection)
              return (
                <WorkRow
                  key={unit.id}
                  unit={unit}
                  article={lookup.article(unit)}
                  locationCode={lookup.locationCode(unit)}
                  warning={`${progress.problems} Prüfpunkt${
                    progress.problems === 1 ? "" : "e"
                  } mit Problem`}
                  action={
                    <Link
                      href={`/units/${unit.id}`}
                      className={buttonVariants({
                        variant: "outline",
                        className: "h-10 px-3.5",
                      })}
                    >
                      Reparatur anlegen
                    </Link>
                  }
                />
              )
            })}
          </ul>
        </Panel>
      )}
    </div>
  )
}

/** Angefangene Prüfungen zuerst — die will man zu Ende bringen. */
function sortByProgress(units: ArticleUnit[]): ArticleUnit[] {
  return [...units].sort((a, b) => {
    const progressA = getInspectionProgress(a.inspection).checked
    const progressB = getInspectionProgress(b.inspection).checked
    if (progressA !== progressB) return progressB - progressA
    return a.unitNumber.localeCompare(b.unitNumber)
  })
}
