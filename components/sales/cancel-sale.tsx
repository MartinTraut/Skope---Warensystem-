"use client"

import { useState } from "react"
import { Undo2 } from "lucide-react"

import { Modal } from "@/components/skope/modal"
import { TextareaField } from "@/components/skope/form"
import { Button } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import { formatCents, formatDate } from "@/lib/domain/money"
import type { Sale } from "@/lib/domain/types"

/* ------------------------------------------------------------------ */
/* Stornieren                                                          */
/* ------------------------------------------------------------------ */

/**
 * Verkauf zurücknehmen.
 *
 * Der Grund ist Pflicht: Ein Storno ohne Begründung ist bei der nächsten
 * Monatsauswertung nicht mehr erklärbar. Ob die Ware zurück ins Lager geht,
 * ist eine eigene Frage — eine Fehlbuchung hat das Regal nie verlassen, eine
 * beschädigte Rücksendung kommt nicht zurück hinein.
 */
export function CancelSaleDialog({
  sale,
  open,
  onOpenChange,
}: {
  sale: Sale
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [reason, setReason] = useState("")
  const [restock, setRestock] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!reason.trim()) {
      setError("Bitte einen Grund angeben.")
      return
    }
    setError(null)
    setBusy(true)
    const result = await runAction(
      repositories.sales.cancel(sale.id, { reason, restock }),
      { success: "Verkauf storniert", failure: "Storno nicht gebucht" }
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
      title="Verkauf stornieren?"
      description={`${sale.itemNumber} · ${formatCents(sale.salePriceCents)} · ${formatDate(sale.soldAt)}`}
      size="sm"
      dirty={reason.trim() !== ""}
      footer={
        <>
          <Button
            variant="outline"
            className="h-10 px-4"
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            className="h-10 px-4"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Wird gebucht …" : "Verkauf stornieren"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextareaField
          label="Grund"
          rows={2}
          required
          placeholder="z. B. Widerruf des Käufers, Preis falsch erfasst"
          value={reason}
          error={error}
          onChange={(event) => setReason(event.target.value)}
        />
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-skope-line p-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-skope-accent"
            checked={restock}
            onChange={(event) => setRestock(event.target.checked)}
          />
          <span className="text-sm leading-relaxed">
            <span className="block font-medium text-foreground">
              Ware geht zurück in den Bestand
            </span>
            <span className="block text-muted-foreground">
              Gegenbuchung über {sale.quantity} Stück zum ursprünglichen
              Einstand. Ohne Haken bleibt der Bestand unverändert — etwa bei
              einer beschädigten Rücksendung.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  )
}

export function CancelSaleButton({ sale }: { sale: Sale }) {
  const [open, setOpen] = useState(false)

  if (sale.cancelledAt) return null

  return (
    <>
      <Button
        variant="outline"
        className="h-8 gap-1.5 px-2.5 text-xs"
        onClick={(event) => {
          // Die Zeile selbst navigiert zum Datenblatt.
          event.stopPropagation()
          setOpen(true)
        }}
      >
        <Undo2 className="size-3.5" />
        Stornieren
      </Button>
      <CancelSaleDialog sale={sale} open={open} onOpenChange={setOpen} />
    </>
  )
}
