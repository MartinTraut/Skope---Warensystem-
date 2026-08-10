"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { FileWarning, PackageOpen, Plus, Upload } from "lucide-react"

import { WorkRow } from "./work-row"
import { NewScooterDialog } from "@/components/scooters/new-scooter-dialog"
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
import { DateTimeText } from "@/components/skope/client-time"
import { isInStock } from "@/lib/domain/status"
import {
  useHydrated,
  useImportBatches,
  useScooters,
} from "@/hooks/use-cockpit"

/**
 * Wareneingang: alles, was angekommen ist und noch keinen Prozessschritt hatte.
 * Die Hauptaktion ist überall dieselbe — die Prüfung starten.
 */
export function InboundView() {
  const hydrated = useHydrated()
  const scooters = useScooters()
  const batches = useImportBatches()
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const stock = scooters.filter(isInStock)
  const arrived = stock
    .filter((scooter) => scooter.workflowStatus === "EINGEGANGEN")
    .sort(
      (a, b) =>
        new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime()
    )
  const unchecked = stock.filter(
    (scooter) => scooter.inspection.completedAt === null
  )
  const missingDocuments = stock.filter((scooter) => !scooter.documents.abe)

  async function startInspection(scooterId: string, scooterNumber: string) {
    setBusy(scooterId)
    const result = await repositories.scooters.updateWorkflowStatus(
      scooterId,
      "IN_PRUEFUNG"
    )
    setBusy(null)

    if (!result.ok) {
      toast.error("Prüfung nicht gestartet", { description: result.message })
      return
    }
    toast.success(`Prüfung für ${scooterNumber} gestartet`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wareneingang"
        description="Neu eingetroffene Geräte erfassen, prüfen und in den Prozess geben."
        actions={
          <>
            <Link
              href="/import"
              className={buttonVariants({
                variant: "outline",
                className: "h-10 gap-2 px-4",
              })}
            >
              <Upload className="size-4" />
              Import starten
            </Link>
            <Button className="h-10 gap-2 px-4" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Scooter erfassen
            </Button>
          </>
        }
      />

      {!hydrated ? (
        <MetricGridSkeleton count={3} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Neu eingegangen"
            value={arrived.length}
            hint="noch kein Prozessschritt"
            icon={<PackageOpen className="size-4" />}
            accent={arrived.length > 0}
          />
          <Metric
            label="Noch nicht geprüft"
            value={unchecked.length}
            hint="Prüfprotokoll offen"
          />
          <Metric
            label="Dokumente fehlen"
            value={missingDocuments.length}
            hint="keine ABE hinterlegt"
            icon={<FileWarning className="size-4" />}
          />
        </div>
      )}

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Neu eingegangen"
          description="Diese Geräte warten auf den Prüfstart."
        />
        {!hydrated ? (
          <TableSkeleton rows={4} />
        ) : arrived.length === 0 ? (
          <EmptyState
            icon={<PackageOpen className="size-5" />}
            title="Wareneingang ist leer"
            description="Alle eingetroffenen Geräte sind bereits im Prozess. Neue Lieferungen kannst du importieren oder einzeln erfassen."
            action={
              <Link
                href="/import"
                className={buttonVariants({ className: "h-10 px-4" })}
              >
                Lieferung importieren
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-skope-line">
            {arrived.map((scooter) => (
              <WorkRow
                key={scooter.id}
                scooter={scooter}
                warning={
                  !scooter.documents.abe ? "ABE fehlt — nachfordern" : undefined
                }
                action={
                  <Button
                    className="h-10 px-3.5"
                    disabled={busy === scooter.id}
                    onClick={() =>
                      startInspection(scooter.id, scooter.scooterNumber)
                    }
                  >
                    {busy === scooter.id ? "…" : "Prüfung starten"}
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </Panel>

      {missingDocuments.length > 0 && (
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Dokumente fehlen"
            description="Ohne ABE kann kein Scooter verkaufsbereit gesetzt werden."
          />
          <ul className="divide-y divide-skope-line">
            {missingDocuments.slice(0, 8).map((scooter) => (
              <WorkRow
                key={scooter.id}
                scooter={scooter}
                warning={scooter.documents.note || "ABE nicht hinterlegt"}
                action={null}
              />
            ))}
          </ul>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Letzte Importe"
          action={
            <Link
              href="/import"
              className="rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-skope-gold"
            >
              Neuer Import
            </Link>
          }
        />
        {batches.length === 0 ? (
          <EmptyState
            title="Noch kein Import"
            description="Lieferantenlisten lassen sich als CSV einlesen und den SKOPE-Feldern zuordnen."
          />
        ) : (
          <ul className="divide-y divide-skope-line">
            {batches.slice(0, 5).map((batch) => (
              <li
                key={batch.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {batch.fileName}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <DateTimeText iso={batch.createdAt} /> · {batch.createdBy}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-state-ready tabular-nums">
                    {batch.rowsImported} importiert
                  </span>
                  {batch.rowsSkipped > 0 && (
                    <span className="text-state-warn tabular-nums">
                      {batch.rowsSkipped} übersprungen
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <NewScooterDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
