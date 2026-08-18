"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Check, CircleAlert, Minus, RotateCcw } from "lucide-react"

import { Panel, PanelBody, PanelHeader } from "@/components/skope/primitives"
import { StatusPill } from "@/components/skope/status-pill"
import { Button } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import { formatDateTime } from "@/lib/domain/money"
import {
  INSPECTION_CHECKS,
  INSPECTION_GROUPS,
  getInspectionProgress,
} from "@/lib/domain/inspection"
import type {
  InspectionResult,
  ArticleUnit,
} from "@/lib/domain/types"
import { FOCUS_RING } from "@/components/skope/focus"
import { cn } from "@/lib/utils"

/**
 * Prüfprotokoll.
 *
 * Auf Werkstatt-Bedienung ausgelegt: drei große Schaltflächen je Prüfpunkt,
 * die sofort speichern. Es gibt keinen Speichern-Button, weil mit Handschuhen
 * niemand einen sucht — jede Eingabe ist unmittelbar wirksam.
 */
export function TabInspection({ unit }: { unit: ArticleUnit }) {
  const progress = getInspectionProgress(unit.inspection)
  const [busy, setBusy] = useState(false)
  const completed = unit.inspection.completedAt !== null
  const locked = completed || unit.saleStatus === "VERKAUFT"

  /*
    Jede Eingabe wird auf ihr Ergebnis geprüft.

    Vorher lief beides ins Leere: Schlug das Speichern fehl, sprang die
    Schaltfläche zurück und sonst geschah nichts. Genau hier ist das am
    teuersten — wer mit Handschuhen ein Protokoll abarbeitet, sieht den
    Rücksprung nicht und hält den Punkt für erledigt.
  */
  async function setResult(checkKey: string, result: InspectionResult) {
    if (locked) return
    await runAction(
      repositories.units.setInspectionCheck(unit.id, checkKey, result),
      { failure: "Prüfpunkt nicht gespeichert" }
    )
  }

  async function setNote(checkKey: string, note: string) {
    if (locked) return
    const check = unit.inspection.checks.find((c) => c.key === checkKey)
    await runAction(
      repositories.units.setInspectionCheck(
        unit.id,
        checkKey,
        check?.result ?? "NICHT_GEPRUEFT",
        note
      ),
      { failure: "Notiz nicht gespeichert" }
    )
  }

  async function complete() {
    setBusy(true)
    const result = await repositories.units.completeInspection(unit.id)
    setBusy(false)

    if (!result.ok) {
      toast.error("Prüfung nicht abgeschlossen", { description: result.message })
      return
    }
    toast.success("Prüfung abgeschlossen", {
      description:
        progress.problems > 0
          ? `${progress.problems} Mangel/Mängel dokumentiert — Reparatur erforderlich.`
          : "Keine Beanstandungen. Das Gerät geht in die Aufbereitung.",
    })
  }

  async function reopen() {
    setBusy(true)
    await repositories.units.reopenInspection(unit.id)
    setBusy(false)
    toast.info("Prüfung wieder geöffnet")
  }

  return (
    <div className="space-y-6">
      <Panel>
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
                    Abgeschlossen {formatDateTime(unit.inspection.completedAt)}
                  </StatusPill>
                  {unit.saleStatus !== "VERKAUFT" && (
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

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-raised">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300",
                progress.problems > 0 ? "bg-state-warn" : "bg-skope-accent"
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
                  const check = unit.inspection.checks.find(
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
                                className="ml-1.5 text-skope-accent"
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

                      {/*
                        Sichtbar, sobald ein Mangel vorliegt ODER bereits Text
                        erfasst wurde. Zuvor verschwand das Feld beim Umschalten
                        auf "Bestanden" mitsamt der noch ungespeicherten
                        Eingabe.
                      */}
                      {(check?.result === "PROBLEM" || check?.note) && (
                        <NoteField
                          value={check?.note ?? ""}
                          disabled={locked}
                          onCommit={(note) => setNote(definition.key, note)}
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
            defaultValue={unit.inspection.note}
            disabled={locked}
            placeholder="Zusammenfassende Bemerkung zum Prüfvorgang …"
            onBlur={(event) =>
              repositories.units.setInspectionNote(unit.id, event.target.value)
            }
            className={cn(
              "w-full resize-y rounded-lg border border-skope-line-strong bg-[#0b0c0e] px-3 py-2.5 text-sm leading-relaxed",
              "text-foreground placeholder:text-muted-foreground/70",
              "focus:border-skope-accent/60 focus:ring-3 focus:ring-skope-accent/15 focus:outline-none",
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
    active: "border-white/15 bg-surface-track text-foreground",
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
              "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 text-xs font-medium transition-colors duration-200 sm:flex-none",
              FOCUS_RING,
              active
                ? option.active
                : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
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

/**
 * Notizfeld eines Prüfpunkts.
 *
 * Kontrolliert geführt und mit kurzer Verzögerung gespeichert: Vorher lag der
 * Wert nur im DOM und wurde erst beim Verlassen des Feldes übernommen — wer
 * eine Mängelbeschreibung tippte und direkt auf einen anderen Reiter wechselte,
 * verlor sie ersatzlos.
 */
function NoteField({
  value,
  disabled,
  onCommit,
}: {
  value: string
  disabled: boolean
  onCommit: (note: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [storedValue, setStoredValue] = useState(value)

  // Änderung von außen (Reset, anderer Tab) übernehmen, ohne Effekt.
  if (value !== storedValue) {
    setStoredValue(value)
    setDraft(value)
  }

  return (
    <input
      type="text"
      value={draft}
      disabled={disabled}
      placeholder="Was genau ist das Problem?"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      className={cn(
        "mt-3 h-11 w-full rounded-lg border border-skope-line-strong bg-[#0b0c0e] px-3 text-sm",
        "text-foreground placeholder:text-muted-foreground/70",
        "focus:border-skope-accent/60 focus:ring-3 focus:ring-skope-accent/15 focus:outline-none",
        "disabled:opacity-60"
      )}
    />
  )
}
