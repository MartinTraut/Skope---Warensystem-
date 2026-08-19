"use client"

import { useState } from "react"

import { SelectField, TextareaField } from "@/components/skope/form"
import { Modal } from "@/components/skope/modal"
import { Button } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import { formatCents } from "@/lib/domain/money"
import type { ArticleUnit } from "@/lib/domain/types"

/**
 * Abgang eines Geräts ohne Verkauf.
 *
 * Bis hierher konnte ein Gerät den Bestand nur über einen Verkauf oder eine
 * Ausschlachtung verlassen. Ein gestohlener, verschrotteter oder selbst
 * genutzter Scooter blieb deshalb im Lagerwert stehen — oder wurde als
 * Verkauf über 0 € gebucht und verdarb damit die Marge des Monats. Beides
 * beschädigt genau die Zahlen, für die das System da ist.
 *
 * Der Grund ist Pflicht: Ein Abgang, den später niemand erklären kann, ist
 * für die Inventur wertlos.
 */
export function WriteOffDialog({
  unit,
  open,
  onOpenChange,
}: {
  unit: ArticleUnit
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [type, setType] = useState<"VERLUST" | "VERBRAUCH">("VERLUST")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const value = unit.purchasePriceCents + unit.additionalCostsCents

  async function submit() {
    if (!reason.trim()) {
      setError("Ohne Grund lässt sich der Abgang später nicht erklären.")
      return
    }

    setError(null)
    setBusy(true)
    const result = await runAction(
      repositories.units.writeOff(unit.id, { type, reason }),
      {
        success:
          type === "VERLUST" ? "Als Verlust ausgebucht" : "Als Verbrauch ausgebucht",
        successDescription: `${unit.unitNumber} verlässt den Bestand. ${formatCents(value)} Einstandswert werden abgeschrieben.`,
        failure: "Abgang nicht gebucht",
      }
    )
    setBusy(false)

    if (result) {
      setReason("")
      onOpenChange(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Gerät ausbuchen"
      description={`${unit.unitNumber} · ${formatCents(value)} Einstandswert`}
      dirty={reason.trim() !== ""}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            size="lg"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Wird gebucht …" : "Ausbuchen"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField
          label="Art des Abgangs"
          hint={
            type === "VERLUST"
              ? "Diebstahl, Totalschaden, Schwund — die Ware ist fort."
              : "Eigenverbrauch: Das Gerät bleibt im Haus, aber nicht im Bestand."
          }
          value={type}
          onChange={(event) =>
            setType(event.target.value as "VERLUST" | "VERBRAUCH")
          }
          options={[
            { value: "VERLUST", label: "Verlust" },
            { value: "VERBRAUCH", label: "Verbrauch" },
          ]}
        />

        <TextareaField
          label="Grund"
          required
          rows={3}
          error={error}
          placeholder="Was ist mit dem Gerät passiert?"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />

        <p className="type-caption text-muted-foreground">
          Der Abgang steht als Buchung im Journal, das Gerät wird archiviert
          und von allen Kanälen genommen. Rückgängig geht das nur über eine
          Gegenbuchung.
        </p>
      </div>
    </Modal>
  )
}
