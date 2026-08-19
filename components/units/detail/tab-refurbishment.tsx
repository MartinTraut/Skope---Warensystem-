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
import {
  InlineSelect,
  MoneyField,
  SelectField,
  TextField,
} from "@/components/skope/form"
import { Button } from "@/components/ui/button"
import { useArticle, useArticleViews } from "@/hooks/use-cockpit"
import { articleLabel } from "@/lib/domain/article-factory"
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
  type ArticleUnit,
} from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/** Reinigung, Reparaturen und Ersatzteile eines Scooters. */
export function TabRefurbishment({ unit }: { unit: ArticleUnit }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Repair | null>(null)
  const costs = repairCostsCents(unit)
  const labor = totalLaborMinutes(unit)
  const open = unit.repairs.filter((repair) => repair.status !== "ERLEDIGT")
  const problems = getProblemChecks(unit)
  const locked = unit.saleStatus === "VERKAUFT"

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
                ? `${open.length} offen, ${unit.repairs.length - open.length} erledigt.`
                : unit.repairs.length > 0
                  ? "Alle Reparaturen erledigt."
                  : undefined
            }
            action={
              !locked && (
                <Button
                  size="sm"
                  onClick={() => setDialogOpen(true)}
                >
                  <Plus className="size-4" />
                  Reparatur
                </Button>
              )
            }
          />

          {unit.repairs.length === 0 ? (
            <EmptyState
              icon={<Wrench className="size-5" />}
              title="Keine Reparaturen erfasst"
              description="Trage hier jede Maßnahme mit Kosten und Arbeitszeit ein — die Summe fließt direkt in die Marge."
              action={
                !locked && (
                  <Button
                    variant="outline"
                    onClick={() => setDialogOpen(true)}
                  >
                    Erste Reparatur anlegen
                  </Button>
                )
              }
            />
          ) : (
            <ul className="divide-y divide-skope-line">
              {unit.repairs.map((repair) => (
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
                              repositories.units.updateRepair(
                                unit.id,
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
          <CleaningPanel unit={unit} locked={locked} />

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
        unit={unit}
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
            repositories.units.removeRepair(unit.id, pendingDelete.id),
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
  unit,
  locked,
}: {
  unit: ArticleUnit
  locked: boolean
}) {
  const done = unit.cleaning.done
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
                ? `Erledigt am ${formatDate(unit.cleaning.doneAt)}`
                : "Noch offen — Voraussetzung für die Verkaufsfreigabe."}
            </p>
          </div>
        </div>

        {!locked && (
          <Button
            variant={done ? "outline" : "default"}
            className="mt-4 w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await runAction(
                  repositories.units.setCleaning(unit.id, !done),
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
  unit,
  open,
  onOpenChange,
}: {
  unit: ArticleUnit
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [problem, setProblem] = useState("")
  const [action, setAction] = useState("")
  const [sparePart, setSparePart] = useState("")
  const [partArticleId, setPartArticleId] = useState("")
  const [partQuantity, setPartQuantity] = useState("1")
  const [cost, setCost] = useState("")
  const [minutes, setMinutes] = useState("")
  const [status, setStatus] = useState<RepairStatus>("OFFEN")
  const [error, setError] = useState<string | null>(null)

  const article = useArticle(unit.articleId)
  const partViews = useArticleViews().filter(
    (view) =>
      view.article.stockMode === "MENGE" &&
      view.article.archivedAt === null &&
      view.stock.quantity > 0
  )
  const selectedPart = partViews.find(
    (view) => view.article.id === partArticleId
  )

  function reset() {
    setProblem("")
    setAction("")
    setSparePart("")
    setPartArticleId("")
    setPartQuantity("1")
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

    /*
      Der Dialog schließt erst, wenn die Reparatur wirklich angelegt ist.

      Vorher wurde das Ergebnis verworfen, der Dialog ging zu und der Toast
      meldete Erfolg — bei einem Fehler waren die eingetippten Kosten weg und
      die Marge stillschweigend falsch. Jetzt bleibt das Formular mit seinen
      Eingaben stehen, damit ein zweiter Versuch nichts kostet.
    */
    const created = await runAction(
      repositories.units.addRepair(unit.id, {
        problem: problem.trim(),
        action: action.trim(),
        sparePart: selectedPart
          ? articleLabel(selectedPart.article)
          : sparePart.trim(),
        partArticleId: partArticleId || null,
        partQuantity: partArticleId ? Number.parseInt(partQuantity, 10) || 1 : 0,
        partCostCents: parseCents(cost) ?? 0,
        laborMinutes: Number.parseInt(minutes, 10) || 0,
        status,
      }),
      { failure: "Reparatur nicht angelegt" }
    )
    if (!created) return

    onOpenChange(false)
    reset()
    toast.success("Reparatur angelegt", {
      description: selectedPart
        ? "Das Ersatzteil wurde aus dem Lager abgebucht; die Kosten fließen in die Marge ein."
        : "Die Kosten fließen ab sofort in die Margenberechnung ein.",
    })
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) window.setTimeout(reset, 200)
      }}
      dirty={Boolean(
        problem.trim() ||
          action.trim() ||
          sparePart.trim() ||
          cost.trim() ||
          minutes.trim()
      )}
      title="Reparatur hinzufügen"
      description={`${unit.unitNumber}${article ? ` · ${articleLabel(article)}` : ""}`}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          <Button onClick={submit}>
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
        {/*
          Ersatzteil aus dem eigenen Lager.

          Das ist die Stelle, an der sich der Kreis schließt: Ein Display aus
          einem ausgeschlachteten Gerät verschwindet beim Einbau nicht still
          aus dem Regal, sondern wird abgebucht und mit seinem tatsächlichen
          Einstandswert in die Marge gerechnet.
        */}
        <SelectField
          label="Ersatzteil aus dem Lager"
          className="sm:col-span-2"
          placeholder="Kein Lagerteil (frei eintragen)"
          value={partArticleId}
          hint={
            selectedPart
              ? `Einstandswert ${formatCents(selectedPart.stock.averageCostCents)} je Stück · ${selectedPart.stock.quantity} auf Bestand`
              : "Wird beim Anlegen abgebucht und mit dem Einstandswert bewertet."
          }
          options={partViews.map((view) => ({
            value: view.article.id,
            label: `${view.article.sku} · ${articleLabel(view.article)} (${view.stock.quantity})`,
          }))}
          onChange={(event) => setPartArticleId(event.target.value)}
        />

        {partArticleId ? (
          <TextField
            label="Entnommene Menge"
            type="number"
            inputMode="numeric"
            min={1}
            max={selectedPart?.stock.quantity ?? 1}
            value={partQuantity}
            onChange={(event) => setPartQuantity(event.target.value)}
          />
        ) : (
          <TextField
            label="Ersatzteil (frei)"
            placeholder='z. B. Reifen 10" Tubeless'
            value={sparePart}
            onChange={(event) => setSparePart(event.target.value)}
          />
        )}

        <MoneyField
          label="Ersatzteilkosten"
          value={cost}
          disabled={Boolean(partArticleId)}
          hint={
            partArticleId
              ? "Kommt aus dem Einstandswert des Lagerteils."
              : undefined
          }
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
