"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Check, CircleAlert, Minus, RotateCcw } from "lucide-react"

import { Panel, PanelBody, PanelHeader } from "@/components/skope/primitives"
import { StatusPill } from "@/components/skope/status-pill"
import { Button } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import { formatDateTime } from "@/lib/domain/money"
import {
  INSPECTION_CHECKS,
  INSPECTION_GROUPS,
  getInspectionProgress,
} from "@/lib/domain/inspection"
import type {
  InspectionResult,
  Scooter,
} from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/**
 * Prüfprotokoll.
 *
 * Auf Werkstatt-Bedienung ausgelegt: drei große Schaltflächen je Prüfpunkt,
 * die sofort speichern. Es gibt keinen Speichern-Button, weil mit Handschuhen
 * niemand einen sucht — jede Eingabe ist unmittelbar wirksam.
 */
export function TabInspection({ scooter }: { scooter: Scooter }) {
  const progress = getInspectionProgress(scooter.inspection)
  const [busy, setBusy] = useState(false)
  const completed = scooter.inspection.completedAt !== null
  const locked = completed || scooter.saleStatus === "VERKAUFT"

  async function setResult(checkKey: string, result: InspectionResult) {
    if (locked) return
    await repositories.scooters.setInspectionCheck(scooter.id, checkKey, result)
  }

  async function setNote(checkKey: string, note: string) {
    if (locked) return
    const check = scooter.inspection.checks.find((c) => c.key === checkKey)
    await repositories.scooters.setInspectionCheck(
      scooter.id,
      checkKey,
      check?.result ?? "NICHT_GEPRUEFT",
      note
    )
  }

  async function complete() {
    setBusy(true)
    const result = await repositories.scooters.completeInspection(scooter.id)
    setBusy(false)

    if (!result.ok) {
      toast.error("Prüfung nicht abgeschlossen", { description: result.message })
      return
    }
    toast.success("Prüfung abgeschlossen", {
      description:
        progress.problems > 0
          ? `${progress.problems} Mangel/Mängel dokumentiert — Reparatur erforderlich.`
          : "Keine Beanstandungen. Der Scooter geht in die Aufbereitung.",
    })
  }

  async function reopen() {
    setBusy(true)
    await repositories.scooters.reopenInspection(scooter.id)
    setBusy(false)
    toast.info("Prüfung wieder geöffnet")
  }

  return (
    <div className="space-y-6">
      <Panel accent={!completed && progress.checked > 0}>
        <PanelBody>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="type-label">Fortschritt</p>
              <p className="mt-2 text-2xl leading-none font-medium tabular-nums text-foreground">
                {progress.checked}
                <span className="text-muted-foreground"> / {progress.total}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {progress.passed} bestanden
                {progress.problems > 0 && (
                  <>
                    {" · "}
                    <span className="text-state-error">
                      {progress.problems} mit Problem
                    </span>
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {completed ? (
                <>
                  <StatusPill tone="ready">
                    Abgeschlossen {formatDateTime(scooter.inspection.completedAt)}
                  </StatusPill>
                  {scooter.saleStatus !== "VERKAUFT" && (
                    <Button
                      variant="outline"
                      className="h-10 gap-2 px-4"
                      onClick={reopen}
                      disabled={busy}
                    >
                      <RotateCcw className="size-4" />
                      Erneut öffnen
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  className="h-10 px-4"
                  onClick={complete}
                  disabled={busy || !progress.complete}
                  title={
                    progress.complete
                      ? undefined
                      : "Erst alle Prüfpunkte bewerten"
                  }
                >
                  {busy ? "…" : "Prüfung abschließen"}
                </Button>
              )}
            </div>
          </div>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/6">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progress.problems > 0 ? "bg-state-warn" : "bg-skope-gold"
              )}
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          {!progress.complete && !completed && (
            <p className="mt-3 text-xs text-muted-foreground">
              Noch {progress.total - progress.checked} Prüfpunkt
              {progress.total - progress.checked === 1 ? "" : "e"} offen. Die
              Prüfung lässt sich erst abschließen, wenn jeder Punkt bewertet ist.
            </p>
          )}
        </PanelBody>
      </Panel>

      {INSPECTION_GROUPS.map((group) => {
        const definitions = INSPECTION_CHECKS.filter(
          (definition) => definition.group === group
        )
        if (definitions.length === 0) return null

        return (
          <Panel key={group}>
            <PanelHeader title={group} />
            <PanelBody className="p-0">
              <ul className="divide-y divide-skope-line">
                {definitions.map((definition) => {
                  const check = scooter.inspection.checks.find(
                    (item) => item.key === definition.key
                  )
                  return (
                    <li key={definition.key} className="px-4 py-3.5 sm:px-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {definition.label}
                            {definition.critical && (
                              <span
                                className="ml-1.5 text-skope-gold"
                                title="Pflichtprüfpunkt"
                              >
                                *
                              </span>
                            )}
                          </p>
                        </div>
                        <ResultToggle
                          value={check?.result ?? "NICHT_GEPRUEFT"}
                          disabled={locked}
                          onChange={(result) => setResult(definition.key, result)}
                        />
                      </div>

                      {/* Notizfeld nur dort, wo es gebraucht wird. */}
                      {(check?.result === "PROBLEM" || check?.note) && (
                        <input
                          type="text"
                          defaultValue={check?.note ?? ""}
                          disabled={locked}
                          placeholder="Was genau ist das Problem?"
                          onBlur={(event) =>
                            setNote(definition.key, event.target.value)
                          }
                          className={cn(
                            "mt-3 h-10 w-full rounded-lg border border-skope-line-strong bg-[#0b0c0e] px-3 text-sm",
                            "text-foreground placeholder:text-muted-foreground/70",
                            "focus:border-skope-gold/60 focus:ring-3 focus:ring-skope-gold/15 focus:outline-none",
                            "disabled:opacity-60"
                          )}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            </PanelBody>
          </Panel>
        )
      })}

      <Panel>
        <PanelHeader title="Gesamtnotiz zur Prüfung" />
        <PanelBody>
          <textarea
            rows={3}
            defaultValue={scooter.inspection.note}
            disabled={locked}
            placeholder="Zusammenfassende Bemerkung zum Prüfvorgang …"
            onBlur={(event) =>
              repositories.scooters.setInspectionNote(scooter.id, event.target.value)
            }
            className={cn(
              "w-full resize-y rounded-lg border border-skope-line-strong bg-[#0b0c0e] px-3 py-2.5 text-sm leading-relaxed",
              "text-foreground placeholder:text-muted-foreground/70",
              "focus:border-skope-gold/60 focus:ring-3 focus:ring-skope-gold/15 focus:outline-none",
              "disabled:opacity-60"
            )}
          />
        </PanelBody>
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Bewertungsschalter                                                  */
/* ------------------------------------------------------------------ */

const OPTIONS: {
  value: InspectionResult
  label: string
  icon: typeof Check
  active: string
}[] = [
  {
    value: "BESTANDEN",
    label: "Bestanden",
    icon: Check,
    active: "border-state-ready/45 bg-state-ready/15 text-state-ready",
  },
  {
    value: "PROBLEM",
    label: "Problem",
    icon: CircleAlert,
    active: "border-state-error/45 bg-state-error/15 text-state-error",
  },
  {
    value: "NICHT_GEPRUEFT",
    label: "Offen",
    icon: Minus,
    active: "border-white/15 bg-white/8 text-foreground",
  },
]

/** Drei-Wege-Schalter mit 44 px Höhe — mit Handschuhen bedienbar. */
function ResultToggle({
  value,
  onChange,
  disabled,
}: {
  value: InspectionResult
  onChange: (result: InspectionResult) => void
  disabled?: boolean
}) {
  return (
    <div
      className="flex w-full shrink-0 gap-1 rounded-lg border border-skope-line bg-black/25 p-1 sm:w-auto"
      role="group"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 text-xs font-medium transition-all duration-150 sm:flex-none",
              active
                ? option.active
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            <Icon className="size-3.5" />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
