"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Modal } from "@/components/skope/modal"
import { Button } from "@/components/ui/button"
import {
  SelectField,
  TextField,
  TextareaField,
  ToggleRow,
} from "@/components/skope/form"
import { useLocations } from "@/hooks/use-cockpit"
import { repositories } from "@/lib/data/demo-repository"
import { toDateInput } from "@/lib/domain/money"
import {
  canTransitionManually,
  CONDITION_META,
  WORKFLOW_META,
} from "@/lib/domain/status"
import {
  CONDITIONS,
  WORKFLOW_STATUSES,
  type Condition,
  type ArticleUnit,
  type WorkflowStatus,
} from "@/lib/domain/types"

/** Stammdaten, Dokumente und Workflow-Status bearbeiten. */
export function EditUnitDialog({
  unit,
  open,
  onOpenChange,
}: {
  unit: ArticleUnit
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [form, setForm] = useState(() => toForm(unit))
  const [saving, setSaving] = useState(false)
  const locations = useLocations()

  // Beim Öffnen den aktuellen Stand laden. Das geschieht bewusst während des
  // Renderns beim Flankenwechsel von `open` und nicht in einem Effekt — so
  // wird kein zusätzlicher Renderdurchlauf mit veralteten Werten sichtbar.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setForm(toForm(unit))
  }

  function set<K extends keyof ReturnType<typeof toForm>>(
    key: K,
    value: ReturnType<typeof toForm>[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setSaving(true)

    const patch: Partial<ArticleUnit> = {
      variant: form.variant,
      color: form.color,
      serialNumber: form.serialNumber,
      mileageKm: Number.parseInt(form.mileageKm, 10) || 0,
      condition: form.condition,
      locationId: form.locationId || null,
      description: form.description,
      notes: form.notes,
      purchaseDate: form.purchaseDate
        ? new Date(form.purchaseDate).toISOString()
        : unit.purchaseDate,
      documents: {
        abe: form.abe,
        invoice: form.invoice,
        other: form.other,
        note: form.documentNote,
      },
    }

    const result = await repositories.units.update(unit.id, patch)

    // Workflow-Status läuft über die eigene Methode, damit die Regeln greifen.
    if (result.ok && form.workflowStatus !== unit.workflowStatus) {
      const statusResult = await repositories.units.updateWorkflowStatus(
        unit.id,
        form.workflowStatus
      )
      if (!statusResult.ok) {
        setSaving(false)
        toast.error("Status nicht geändert", { description: statusResult.message })
        return
      }
    }

    setSaving(false)

    if (!result.ok) {
      toast.error("Nicht gespeichert", { description: result.message })
      return
    }

    onOpenChange(false)
    toast.success("Änderungen gespeichert")
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      /*
        Verglichen wird gegen den Stand beim Öffnen: Wer nur hineinschaut und
        wieder schließt, soll nicht gefragt werden — wer etwas geändert hat,
        schon.
      */
      dirty={JSON.stringify(form) !== JSON.stringify(toForm(unit))}
      title="Gerät bearbeiten"
      description={unit.unitNumber}
      size="lg"
      footer={
        <>
          <Button
            variant="outline"
            className="h-10 px-4"
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          <Button className="h-10 px-4" onClick={save} disabled={saving}>
            {saving ? "Wird gespeichert …" : "Speichern"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {/*
            Hersteller und Modell stehen am Artikel, nicht am Gerät.

            Sie hier editierbar zu machen, würde eine Änderung suggerieren, die
            nur ein Gerät beträfe — tatsächlich gehören beide zum Stammsatz und
            gelten für alle Geräte desselben Modells.
          */}
          <TextField
            label="Variante"
            value={form.variant}
            onChange={(event) => set("variant", event.target.value)}
          />
          <TextField
            label="Farbe"
            value={form.color}
            onChange={(event) => set("color", event.target.value)}
          />
          <TextField
            label="Seriennummer"
            mono
            value={form.serialNumber}
            onChange={(event) => set("serialNumber", event.target.value)}
          />
          <TextField
            label="Kilometerstand"
            type="number"
            inputMode="numeric"
            min={0}
            value={form.mileageKm}
            onChange={(event) => set("mileageKm", event.target.value)}
          />
          <SelectField
            label="Zustand"
            value={form.condition}
            onChange={(event) => set("condition", event.target.value as Condition)}
            options={CONDITIONS.map((condition) => ({
              value: condition,
              label: CONDITION_META[condition].label,
            }))}
          />
          <SelectField
            label="Lagerplatz"
            placeholder="Ohne Lagerplatz"
            value={form.locationId}
            onChange={(event) => set("locationId", event.target.value)}
            options={locations.map((location) => ({
              value: location.id,
              label: `${location.code} – ${location.name}`,
            }))}
          />
          <TextField
            label="Einkaufsdatum"
            type="date"
            value={form.purchaseDate}
            onChange={(event) => set("purchaseDate", event.target.value)}
          />
          <SelectField
            label="Workflow-Status"
            hint="Manuelle Korrektur des Prozessstands."
            value={form.workflowStatus}
            onChange={(event) =>
              set("workflowStatus", event.target.value as WorkflowStatus)
            }
            /*
              Nur erreichbare Ziele anbieten. Vorher stand die vollständige
              Liste zur Wahl, und ein unzulässiger Sprung schlug erst beim
              Speichern fehl. „Ausgeschlachtet" fehlt hier bewusst: Diesen
              Zustand setzt die Ausschlachtung, weil nur sie den Einkaufswert
              auf die Teile verteilt.
            */
            options={WORKFLOW_STATUSES.filter(
              (status) =>
                status === unit.workflowStatus ||
                canTransitionManually(unit.workflowStatus, status)
            ).map((status) => ({
              value: status,
              label: WORKFLOW_META[status].label,
            }))}
          />
        </div>

        <TextareaField
          label="Beschreibung"
          hint="Wird bei der Veröffentlichung als Produkttext übernommen."
          rows={4}
          value={form.description}
          onChange={(event) => set("description", event.target.value)}
        />

        <TextareaField
          label="Interne Notizen"
          rows={2}
          value={form.notes}
          onChange={(event) => set("notes", event.target.value)}
        />

        <div>
          <p className="type-label mb-2">Dokumente</p>
          <div className="space-y-2">
            <ToggleRow
              label="ABE / Betriebserlaubnis"
              description="Voraussetzung für die Verkaufsfreigabe."
              checked={form.abe}
              onCheckedChange={(value) => set("abe", value)}
            />
            <ToggleRow
              label="Einkaufsrechnung"
              checked={form.invoice}
              onCheckedChange={(value) => set("invoice", value)}
            />
            <ToggleRow
              label="Sonstige Papiere"
              checked={form.other}
              onCheckedChange={(value) => set("other", value)}
            />
          </div>
          <TextField
            label="Hinweis zu den Dokumenten"
            className="mt-3"
            placeholder="z. B. ABE beim Lieferanten nachgefordert"
            value={form.documentNote}
            onChange={(event) => set("documentNote", event.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}

function toForm(unit: ArticleUnit) {
  return {
    variant: unit.variant,
    color: unit.color,
    serialNumber: unit.serialNumber,
    mileageKm: String(unit.mileageKm),
    condition: unit.condition,
    locationId: unit.locationId ?? "",
    description: unit.description,
    notes: unit.notes,
    purchaseDate: toDateInput(unit.purchaseDate),
    workflowStatus: unit.workflowStatus,
    abe: unit.documents.abe,
    invoice: unit.documents.invoice,
    other: unit.documents.other,
    documentNote: unit.documents.note,
  }
}
