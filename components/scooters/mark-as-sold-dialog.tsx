"use client"

import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangle } from "lucide-react"

import { Modal } from "@/components/skope/modal"
import { Button } from "@/components/ui/button"
import { MoneyField, SelectField, TextareaField, TextField } from "@/components/skope/form"
import { repositories } from "@/lib/data/demo-repository"
import { centsToInput, formatCents, parseCents } from "@/lib/domain/money"
import { repairCostsCents } from "@/lib/domain/metrics"
import { SALE_CHANNEL_META, modelLabel } from "@/lib/domain/status"
import { SALE_CHANNELS, type SaleChannel, type Scooter } from "@/lib/domain/types"

const CHANNEL_OPTIONS = SALE_CHANNELS.map((channel) => ({
  value: channel,
  label: SALE_CHANNEL_META[channel].label,
}))

/**
 * Manuellen Verkauf erfassen.
 *
 * Der Dialog zeigt die resultierende Marge live mit — beim Verkauf vor Ort
 * wird oft verhandelt, und dann muss sofort sichtbar sein, wo die Grenze liegt.
 */
export function MarkAsSoldDialog({
  scooter,
  open,
  onOpenChange,
}: {
  scooter: Scooter
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [channel, setChannel] = useState<SaleChannel>("VOR_ORT")
  const [price, setPrice] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  // Beim Öffnen mit dem kalkulierten Verkaufspreis vorbelegen — während des
  // Renderns beim Flankenwechsel, nicht in einem Effekt.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setPrice(centsToInput(scooter.salePriceCents))
      setDate(new Date().toISOString().slice(0, 10))
      setNote("")
      setChannel("VOR_ORT")
    }
  }

  const priceCents = parseCents(price)
  const costCents =
    scooter.purchasePriceCents +
    repairCostsCents(scooter) +
    scooter.additionalCostsCents
  const marginCents = priceCents === null ? null : priceCents - costCents

  async function handleSubmit() {
    if (priceCents === null || priceCents <= 0) {
      toast.error("Verkaufspreis fehlt", {
        description: "Ohne Verkaufspreis kann der Verkauf nicht erfasst werden.",
      })
      return
    }

    setSaving(true)
    const result = await repositories.scooters.markAsSold(scooter.id, {
      channel,
      salePriceCents: priceCents,
      soldAt: new Date(date).toISOString(),
      note,
    })
    setSaving(false)

    if (!result.ok) {
      toast.error("Verkauf nicht erfasst", { description: result.message })
      return
    }

    onOpenChange(false)
    toast.success(`${scooter.scooterNumber} als verkauft erfasst`, {
      description:
        "Bestand auf 0 gesetzt, Kanäle deaktiviert und Reporting angestoßen.",
    })
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Als verkauft markieren"
      description={`${scooter.scooterNumber} · ${modelLabel(scooter)}`}
      footer={
        <>
          <Button
            variant="outline"
            className="h-10 px-4"
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          <Button className="h-10 px-4" onClick={handleSubmit} disabled={saving}>
            {saving ? "Wird erfasst …" : "Verkauf erfassen"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Verkaufskanal"
            required
            options={CHANNEL_OPTIONS}
            value={channel}
            onChange={(event) => setChannel(event.target.value as SaleChannel)}
          />
          <MoneyField
            label="Verkaufspreis"
            required
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
          <TextField
            label="Verkaufsdatum"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>

        <TextareaField
          label="Notiz"
          rows={2}
          placeholder="optional — z. B. Zahlungsart, Käuferhinweis"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        {/* Live-Kalkulation */}
        <div className="rounded-lg border border-skope-line bg-white/2 p-4">
          <p className="type-label">Kalkulation</p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Einkauf" value={formatCents(scooter.purchasePriceCents)} />
            <Row
              label="Reparaturen"
              value={formatCents(repairCostsCents(scooter))}
            />
            <Row
              label="Weitere Kosten"
              value={formatCents(scooter.additionalCostsCents)}
            />
            <div className="my-2 h-px bg-skope-line" />
            <Row
              label="Verkaufspreis"
              value={priceCents === null ? "—" : formatCents(priceCents)}
              strong
            />
            <Row
              label="Operative Marge"
              value={marginCents === null ? "—" : formatCents(marginCents)}
              tone={
                marginCents === null
                  ? undefined
                  : marginCents < 0
                    ? "negative"
                    : "positive"
              }
              strong
            />
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Operative Rechengröße ohne steuerliche Betrachtung. Eine mögliche
            Differenzbesteuerung ist hier bewusst nicht abgebildet.
          </p>
        </div>

        <div className="flex gap-2.5 rounded-lg border border-skope-gold/25 bg-skope-gold/6 p-3.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-skope-gold" />
          <p className="text-xs leading-relaxed text-foreground/85">
            Mit dem Erfassen wird der Scooter zentral auf <strong>VERKAUFT</strong>{" "}
            gesetzt, der Bestand auf 0 reduziert und alle aktiven Kanäle werden
            deaktiviert. Anschließend läuft die Reporting-Synchronisation.
          </p>
        </div>
      </div>
    </Modal>
  )
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: "positive" | "negative"
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          "tabular-nums " +
          (strong ? "font-medium " : "") +
          (tone === "positive"
            ? "text-state-ready"
            : tone === "negative"
              ? "text-state-error"
              : "text-foreground")
        }
      >
        {value}
      </dd>
    </div>
  )
}
