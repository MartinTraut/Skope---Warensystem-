"use client"

import Link from "next/link"
import { toast } from "sonner"
import { Sparkles, Wrench } from "lucide-react"

import { WorkRow } from "./work-row"
import {
  EmptyState,
  Metric,
  Panel,
  PanelHeader,
  PageHeader,
} from "@/components/skope/primitives"
import { MetricGridSkeleton, TableSkeleton } from "@/components/skope/skeletons"
import { Button, buttonVariants } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import { formatCents, formatCentsCompact } from "@/lib/domain/money"
import { repairCostsCents } from "@/lib/domain/metrics"
import { isInStock } from "@/lib/domain/status"
import { useHydrated, useScooters } from "@/hooks/use-cockpit"

/** Arbeitsliste Aufbereitung: offene Reparaturen und ausstehende Reinigungen. */
export function RefurbishmentView() {
  const hydrated = useHydrated()
  const scooters = useScooters().filter(isInStock)

  const inRefurbishment = scooters.filter(
    (scooter) => scooter.workflowStatus === "AUFBEREITUNG"
  )
  const openRepairs = scooters.filter((scooter) =>
    scooter.repairs.some((repair) => repair.status !== "ERLEDIGT")
  )
  const needsCleaning = inRefurbishment.filter(
    (scooter) => !scooter.cleaning.done
  )
  const openCosts = openRepairs.reduce(
    (sum, scooter) => sum + repairCostsCents(scooter),
    0
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aufbereitung"
        description="Reinigung, Reparaturen und Ersatzteile — alles, was zwischen Prüfung und Freigabe liegt."
      />

      {!hydrated ? (
        <MetricGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="In Aufbereitung"
            value={inRefurbishment.length}
            icon={<Wrench className="size-4" />}
            accent={inRefurbishment.length > 0}
          />
          <Metric
            label="Offene Reparaturen"
            value={openRepairs.length}
            hint="mindestens eine Position offen"
          />
          <Metric
            label="Reinigung offen"
            value={needsCleaning.length}
            icon={<Sparkles className="size-4" />}
          />
          <Metric
            label="Gebundene Teilekosten"
            value={formatCentsCompact(openCosts)}
            hint="in laufender Aufbereitung"
          />
        </div>
      )}

      <Panel className="overflow-hidden">
        <PanelHeader
          title="In Aufbereitung"
          description="Geräte zwischen abgeschlossener Prüfung und Verkaufsfreigabe."
        />
        {!hydrated ? (
          <TableSkeleton rows={5} />
        ) : inRefurbishment.length === 0 ? (
          <EmptyState
            icon={<Wrench className="size-5" />}
            title="Werkstatt ist leer"
            description="Kein Gerät befindet sich aktuell in der Aufbereitung."
            action={
              <Link
                href="/inspection"
                className={buttonVariants({
                  variant: "outline",
                  className: "h-10 px-4",
                })}
              >
                Zu den Prüfungen
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-skope-line">
            {inRefurbishment.map((scooter) => {
              const open = scooter.repairs.filter((r) => r.status !== "ERLEDIGT")
              const costs = repairCostsCents(scooter)

              return (
                <WorkRow
                  key={scooter.id}
                  scooter={scooter}
                  meta={
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {scooter.repairs.length === 0
                          ? "Keine Reparaturen erfasst"
                          : `${open.length} von ${scooter.repairs.length} Reparaturen offen`}
                      </span>
                      {costs > 0 && (
                        <span className="tabular-nums">
                          Teile {formatCents(costs)}
                        </span>
                      )}
                      <span
                        className={
                          scooter.cleaning.done
                            ? "text-state-ready"
                            : "text-state-warn"
                        }
                      >
                        {scooter.cleaning.done
                          ? "Reinigung erledigt"
                          : "Reinigung offen"}
                      </span>
                    </div>
                  }
                  action={
                    !scooter.cleaning.done && open.length === 0 ? (
                      <Button
                        className="h-10 px-3.5"
                        onClick={async () => {
                          await repositories.scooters.setCleaning(scooter.id, true)
                          toast.success(
                            `${scooter.scooterNumber}: Reinigung erledigt`
                          )
                        }}
                      >
                        Gereinigt
                      </Button>
                    ) : null
                  }
                />
              )
            })}
          </ul>
        )}
      </Panel>

      {openRepairs.length > 0 && (
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Offene Reparaturpositionen"
            description="Nach Gerät gruppiert, mit Kosten und Status."
          />
          <ul className="divide-y divide-skope-line">
            {openRepairs.map((scooter) => (
              <li key={scooter.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link
                    href={`/scooters/${scooter.id}`}
                    className="rounded font-mono text-sm font-medium text-foreground transition-colors hover:text-skope-gold"
                  >
                    {scooter.scooterNumber}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {scooter.manufacturer} {scooter.model}
                  </span>
                </div>
                <ul className="mt-2.5 space-y-1.5">
                  {scooter.repairs
                    .filter((repair) => repair.status !== "ERLEDIGT")
                    .map((repair) => (
                      <li
                        key={repair.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm"
                      >
                        <span className="min-w-0 text-foreground/85">
                          {repair.problem}
                          {repair.sparePart && (
                            <span className="text-muted-foreground">
                              {" "}
                              · {repair.sparePart}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatCents(repair.partCostCents)} ·{" "}
                          {repair.status === "OFFEN" ? "offen" : "in Arbeit"}
                        </span>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
