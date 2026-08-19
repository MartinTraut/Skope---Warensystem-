"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { FileWarning, PackageOpen, Plus, Upload } from "lucide-react"

import { WorkRow } from "./work-row"
import { NewArticleDialog } from "@/components/inventory/new-article-dialog"
import { NewUnitDialog } from "@/components/units/new-unit-dialog"
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
import {
  useHydrated,
  useImportBatches,
  useUnitLookup,
  useUnitsInStock,
} from "@/hooks/use-cockpit"

/**
 * Wareneingang: alles, was angekommen ist und noch keinen Prozessschritt hatte.
 * Die Hauptaktion ist überall dieselbe — die Prüfung starten.
 */
export function InboundView() {
  const hydrated = useHydrated()
  const stock = useUnitsInStock()
  const lookup = useUnitLookup()
  const batches = useImportBatches()
  const [unitOpen, setUnitOpen] = useState(false)
  const [articleOpen, setArticleOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const arrived = stock
    .filter((unit) => unit.workflowStatus === "EINGEGANGEN")
    .sort(
      (a, b) =>
        new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime()
    )
  const unchecked = stock.filter((unit) => unit.inspection.completedAt === null)
  const missingDocuments = stock.filter((unit) => !unit.documents.abe)

  async function startInspection(unitId: string, unitNumber: string) {
    setBusy(unitId)
    const result = await repositories.units.updateWorkflowStatus(
      unitId,
      "IN_PRUEFUNG"
    )
    setBusy(null)

    if (!result.ok) {
      toast.error("Prüfung nicht gestartet", { description: result.message })
      return
    }
    toast.success(`Prüfung für ${unitNumber} gestartet`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wareneingang"
        description="Neu eingetroffene Geräte erfassen und in den Prozess geben. Ersatzteile werden als Zugang auf ihren Artikel gebucht."
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
            <Button
              variant="outline"
              onClick={() => setArticleOpen(true)}
            >
              <Plus className="size-4" />
              Artikel anlegen
            </Button>
            <Button onClick={() => setUnitOpen(true)}>
              <Plus className="size-4" />
              Gerät erfassen
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
            {arrived.map((unit) => (
              <WorkRow
                key={unit.id}
                unit={unit}
                article={lookup.article(unit)}
                locationCode={lookup.locationCode(unit)}
                warning={
                  !unit.documents.abe ? "ABE fehlt — nachfordern" : undefined
                }
                action={
                  <Button
                    disabled={busy === unit.id}
                    onClick={() => startInspection(unit.id, unit.unitNumber)}
                  >
                    {busy === unit.id ? "…" : "Prüfung starten"}
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
            description="Ohne ABE kann kein zulassungspflichtiges Gerät verkaufsbereit gesetzt werden."
          />
          <ul className="divide-y divide-skope-line">
            {missingDocuments.slice(0, 8).map((unit) => (
              <WorkRow
                key={unit.id}
                unit={unit}
                article={lookup.article(unit)}
                locationCode={lookup.locationCode(unit)}
                warning={unit.documents.note || "ABE nicht hinterlegt"}
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
              className="rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-skope-accent"
            >
              Neuer Import
            </Link>
          }
        />
        {batches.length === 0 ? (
          <EmptyState
            title="Noch kein Import"
            description="Lieferantenlisten lassen sich als CSV einlesen und je Bereich den Feldern zuordnen — auch den eigenen Merkmalsfeldern."
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

      <NewUnitDialog open={unitOpen} onOpenChange={setUnitOpen} />
      <NewArticleDialog open={articleOpen} onOpenChange={setArticleOpen} />
    </div>
  )
}
