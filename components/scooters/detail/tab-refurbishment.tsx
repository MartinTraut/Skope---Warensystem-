"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Plus, Sparkles, Trash2, Wrench } from "lucide-react"

import { StatusPill } from "@/components/skope/status-pill"
import { ConfirmDialog } from "@/components/skope/confirm-dialog"
import { FOCUS_RING } from "@/components/skope/focus"
import { Modal } from "@/components/skope/modal"
import {
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/skope/primitives"
import { InlineSelect, MoneyField, TextField } from "@/components/skope/form"
import { Button } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import { getProblemChecks } from "@/lib/domain/inspection"
import { formatCents, formatDate, formatMinutes, parseCents } from "@/lib/domain/money"
import { repairCostsCents, totalLaborMinutes } from "@/lib/domain/metrics"
import { REPAIR_STATUS_META } from "@/lib/domain/status"
import {
  REPAIR_STATUSES,
  type Repair,
  type RepairStatus,
  type Scooter,
} from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/** Reinigung, Reparaturen und Ersatzteile eines Scooters. */
export function TabRefurbishment({ scooter }: { scooter: Scooter }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Repair | null>(null)
  const costs = repairCostsCents(scooter)
  const labor = totalLaborMinutes(scooter)
  const open = scooter.repairs.filter((repair) => repair.status !== "ERLEDIGT")
  const problems = getProblemChecks(scooter)
  const locked = scooter.saleStatus === "VERKAUFT"

  return (
    <div className="space-y-6">
      {/* Aus der Prüfung übernommene Mängel — damit nichts untergeht. */}
      {problems.length > 0 && (
        <Panel className="border-state-warn/25">
          <PanelHeader
            title="Offene Befunde aus der Prüfung"
            description="Diese Punkte wurden bei der Prüfung beanstandet."
          />
          <PanelBody className="p-3 sm:p-3">
            <ul className="space-y-0.5">
              {problems.map((problem) => (
                <li
                  key={problem.key}
                  className="flex items-start gap-2.5 rounded-lg px-2.5 py-2"
                >
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-state-warn"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="type-body-sm font-medium text-foreground">
                      {problem.definition?.label ?? problem.key}
                    </p>
                    {problem.note && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {problem.note}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Reparaturen"
            description={
              open.length > 0
                ? `${open.length} offen, ${scooter.repairs.length - open.length} erledigt.`
                : scooter.repairs.length > 0
                  ? "Alle Reparaturen erledigt."
                  : undefined
            }
            action={
              !locked && (
                <Button
                  className="h-9 gap-2 px-3.5"
                  onClick={() => setDialogOpen(true)}
                >
                  <Plus className="size-4" />
                  Reparatur
                </Button>
              )
            }
          />

          {scooter.repairs.length === 0 ? (
            <EmptyState
              icon={<Wrench className="size-5" />}
              title="Keine Reparaturen erfasst"
              description="Trage hier jede Maßnahme mit Kosten und Arbeitszeit ein — die Summe fließt direkt in die Marge."
              action={
                !locked && (
                  <Button
                    variant="outline"
                    className="h-10 px-4"
                    onClick={() => setDialogOpen(true)}
                  >
                    Erste Reparatur anlegen
                  </Button>
                )
              }
            />
          ) : (
            <ul className="divide-y divide-skope-line">
              {scooter.repairs.map((repair) => (
                <li key={repair.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {repair.problem}
                      </p>
                      {repair.action && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          → {repair.action}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {repair.sparePart && <span>{repair.sparePart}</span>}
                        <span className="tabular-nums">
                          {formatCents(repair.partCostCents)}
                        </span>
                        {repair.laborMinutes > 0 && (
                          <span>{formatMinutes(repair.laborMinutes)}</span>
                        )}
                        <span>{formatDate(repair.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {locked ? (
                        <StatusPill
                          tone={REPAIR_STATUS_META[repair.status].tone}
                          size="sm"
                        >
                          {REPAIR_STATUS_META[repair.status].label}
                        </StatusPill>
                      ) : (
                        <InlineSelect
                          aria-label={`Status von ${repair.problem}`}
                          className="w-[8.5rem]"
                          value={repair.status}
                          onChange={(event) =>
                            runAction(
                              repositories.scooters.updateRepair(
                                scooter.id,
                                repair.id,
                                { status: event.target.value as RepairStatus }
                              ),
                              { failure: "Status nicht geändert" }
                            )
                          }
                          options={REPAIR_STATUSES.map((status) => ({
                            value: status,
                            label: REPAIR_STATUS_META[status].label,
                          }))}
                        />
                      )}
                      {!locked && (
                        <button
                          type="button"
                          aria-label="Reparatur löschen"
                          onClick={() => setPendingDelete(repair)}
                          className={cn(
                            "grid size-11 place-items-center rounded-lg text-muted-foreground/60 transition-colors",
                            "hover:bg-state-error/10 hover:text-state-error",
                            FOCUS_RING
                          )}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <CleaningPanel scooter={scooter} locked={locked} />

          <Panel>
            <PanelHeader title="Aufbereitungskosten" />
            <PanelBody className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-muted-foreground">Ersatzteile</span>
                <span className="font-medium tabular-nums text-foreground">
                  {formatCents(costs)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-muted-foreground">Arbeitszeit</span>
                <span className="tabular-nums text-foreground">
                  {labor > 0 ? formatMinutes(labor) : "—"}
                </span>
              </div>
              <p className="pt-2 type-caption leading-relaxed text-muted-foreground">
                Die Ersatzteilkosten werden automatisch summiert und in der
                Margenberechnung berücksichtigt. Arbeitszeit fließt derzeit nicht
                monetär in die Marge ein.
              </p>
            </PanelBody>
          </Panel>
        </div>
      </div>

      <RepairDialog
        scooter={scooter}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Reparatur löschen?"
        description={
          <>
            <span className="font-medium text-foreground">
              {pendingDelete?.problem}
            </span>{" "}
            wird dauerhaft entfernt. Die hinterlegten Kosten fallen damit aus
            der Margenrechnung heraus.
          </>
        }
        onConfirm={async () => {
          if (!pendingDelete) return
          await runAction(
            repositories.scooters.removeRepair(scooter.id, pendingDelete.id),
            { success: "Reparatur entfernt", failure: "Reparatur nicht entfernt" }
          )
          setPendingDelete(null)
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Reinigung                                                           */
/* ------------------------------------------------------------------ */

function CleaningPanel({
  scooter,
  locked,
}: {
  scooter: Scooter
  locked: boolean
}) {
  const done = scooter.cleaning.done
  const [busy, setBusy] = useState(false)

  return (
    <Panel>
      <PanelBody>
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg border",
              done
                ? "border-state-ready/30 bg-state-ready/12 text-state-ready"
                : "border-skope-line bg-surface-sunken text-muted-foreground"
            )}
            aria-hidden
          >
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Reinigung</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {done
                ? `Erledigt am ${formatDate(scooter.cleaning.doneAt)}`
                : "Noch offen — Voraussetzung für die Verkaufsfreigabe."}
            </p>
          </div>
        </div>

        {!locked && (
          <Button
            variant={done ? "outline" : "default"}
            className="mt-4 h-10 w-full px-4"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await runAction(
                  repositories.scooters.setCleaning(scooter.id, !done),
                  {
                    success: done ? "Reinigung zurückgesetzt" : "Reinigung erledigt",
                    failure: "Reinigungsstatus nicht geändert",
                  }
                )
              } finally {
                setBusy(false)
              }
            }}
          >
            {done ? "Zurücksetzen" : "Als gereinigt markieren"}
          </Button>
        )}
      </PanelBody>
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* Reparaturdialog                                                     */
/* ------------------------------------------------------------------ */

function RepairDialog({
  scooter,
  open,
  onOpenChange,
}: {
  scooter: Scooter
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [problem, setProblem] = useState("")
  const [action, setAction] = useState("")
  const [sparePart, setSparePart] = useState("")
  const [cost, setCost] = useState("")
  const [minutes, setMinutes] = useState("")
  const [status, setStatus] = useState<RepairStatus>("OFFEN")
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setProblem("")
    setAction("")
    setSparePart("")
    setCost("")
    setMinutes("")
    setStatus("OFFEN")
    setError(null)
  }

  async function submit() {
    if (!problem.trim()) {
      setError("Bitte beschreibe das Problem.")
      return
    }

    await repositories.scooters.addRepair(scooter.id, {
      problem: problem.trim(),
      action: action.trim(),
      sparePart: sparePart.trim(),
      partCostCents: parseCents(cost) ?? 0,
      laborMinutes: Number.parseInt(minutes, 10) || 0,
      status,
    })

    onOpenChange(false)
    reset()
    toast.success("Reparatur angelegt", {
      description: "Die Kosten fließen ab sofort in die Margenberechnung ein.",
    })
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) window.setTimeout(reset, 200)
      }}
      title="Reparatur hinzufügen"
      description={`${scooter.scooterNumber} · ${scooter.manufacturer} ${scooter.model}`}
      footer={
        <>
          <Button
            variant="outline"
            className="h-10 px-4"
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          <Button className="h-10 px-4" onClick={submit}>
            Reparatur anlegen
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Problem"
          required
          className="sm:col-span-2"
          placeholder="z. B. Hinterreifen beschädigt"
          value={problem}
          error={error}
          onChange={(event) => {
            setProblem(event.target.value)
            setError(null)
          }}
        />
        <TextField
          label="Ausgeführte Arbeit"
          className="sm:col-span-2"
          placeholder="z. B. Reifen ersetzt"
          value={action}
          onChange={(event) => setAction(event.target.value)}
        />
        <TextField
          label="Ersatzteil"
          placeholder='z. B. Reifen 10" Tubeless'
          value={sparePart}
          onChange={(event) => setSparePart(event.target.value)}
        />
        <MoneyField
          label="Ersatzteilkosten"
          value={cost}
          onChange={(event) => setCost(event.target.value)}
        />
        <TextField
          label="Arbeitszeit"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="0"
          hint="in Minuten"
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
        />
        <div>
          <p className="mb-1.5 type-body-sm font-medium text-foreground/90">
            Status
          </p>
          <InlineSelect
            aria-label="Reparaturstatus"
            className="h-11"
            value={status}
            onChange={(event) => setStatus(event.target.value as RepairStatus)}
            options={REPAIR_STATUSES.map((value) => ({
              value,
              label: REPAIR_STATUS_META[value].label,
            }))}
          />
        </div>
      </div>
    </Modal>
  )
}
