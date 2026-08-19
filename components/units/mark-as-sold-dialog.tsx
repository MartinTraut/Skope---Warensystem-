"use client"

import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangle } from "lucide-react"

import { Modal } from "@/components/skope/modal"
import { Button } from "@/components/ui/button"
import { MoneyField, SelectField, TextareaField, TextField } from "@/components/skope/form"
import { useArticle, useLocations } from "@/hooks/use-cockpit"
import { unitLabel } from "@/lib/domain/article-factory"
import { repositories } from "@/lib/data/demo-repository"
import { centsToInput, formatCents, parseCents } from "@/lib/domain/money"
import { repairCostsCents } from "@/lib/domain/metrics"
import {
  CUSTOMER_SOURCE_META,
  SALE_CHANNEL_META,
} from "@/lib/domain/status"
import {
  CUSTOMER_SOURCES,
  SALE_CHANNELS,
  type CustomerSource,
  type SaleChannel,
  type ArticleUnit,
} from "@/lib/domain/types"

const CHANNEL_OPTIONS = SALE_CHANNELS.map((channel) => ({
  value: channel,
  label: SALE_CHANNEL_META[channel].label,
}))

const SOURCE_OPTIONS = CUSTOMER_SOURCES.map((source) => ({
  value: source,
  label: CUSTOMER_SOURCE_META[source].label,
}))

/**
 * Manuellen Verkauf erfassen.
 *
 * Der Dialog zeigt die resultierende Marge live mit — beim Verkauf vor Ort
 * wird oft verhandelt, und dann muss sofort sichtbar sein, wo die Grenze liegt.
 */
export function MarkAsSoldDialog({
  unit,
  open,
  onOpenChange,
}: {
  unit: ArticleUnit
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [channel, setChannel] = useState<SaleChannel>("VOR_ORT")
  const [source, setSource] = useState<CustomerSource>("UNBEKANNT")
  const [region, setRegion] = useState("")
  const [place, setPlace] = useState("")
  const [price, setPrice] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  const article = useArticle(unit.articleId)
  const locations = useLocations()
  // Vorbelegung des Übergabeorts: der Lagerplatz, an dem das Gerät steht.
  const locationLabel =
    locations.find((entry) => entry.id === unit.locationId)?.name ?? ""

  // Beim Öffnen mit dem kalkulierten Verkaufspreis vorbelegen — während des
  // Renderns beim Flankenwechsel, nicht in einem Effekt.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setPrice(centsToInput(unit.salePriceCents))
      setDate(new Date().toISOString().slice(0, 10))
      setNote("")
      setChannel("VOR_ORT")
      setSource("UNBEKANNT")
      setRegion("")
      setPlace(locationLabel)
    }
  }

  const priceCents = parseCents(price)
  const costCents =
    unit.purchasePriceCents +
    repairCostsCents(unit) +
    unit.additionalCostsCents
  const marginCents = priceCents === null ? null : priceCents - costCents

  async function handleSubmit() {
    if (priceCents === null || priceCents <= 0) {
      toast.error("Verkaufspreis fehlt", {
        description: "Ohne Verkaufspreis kann der Verkauf nicht erfasst werden.",
      })
      return
    }

    // Ein geleertes Datumsfeld ergibt ein ungültiges Date, dessen toISOString()
    // wirft — der Dialog bliebe dann dauerhaft auf "Wird erfasst …" stehen.
    const soldAt = new Date(date)
    if (Number.isNaN(soldAt.getTime())) {
      toast.error("Verkaufsdatum fehlt", {
        description: "Bitte ein gültiges Datum angeben.",
      })
      return
    }

    setSaving(true)
    let result
    try {
      result = await repositories.units.markAsSold(unit.id, {
        channel,
        customerSource: source,
        customerRegion: region,
        saleLocation: place,
        salePriceCents: priceCents,
        soldAt: soldAt.toISOString(),
        note,
      })
    } finally {
      setSaving(false)
    }

    if (!result.ok) {
      toast.error("Verkauf nicht erfasst", { description: result.message })
      return
    }

    onOpenChange(false)

    if (result.data.sheetsSyncStatus === "FEHLER") {
      toast.warning(`${unit.unitNumber} verkauft — Reporting offen`, {
        description:
          `Bestand auf 0 gesetzt und Kanäle deaktiviert. Die Umsatzzeile wurde ` +
          `nicht geschrieben und kann im Reiter „Verkauf" wiederholt werden.`,
      })
      return
    }

    toast.success(`${unit.unitNumber} als verkauft erfasst`, {
      description:
        "Bestand auf 0 gesetzt, Kanäle deaktiviert und Reporting geschrieben.",
    })
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      /*
        Gegen die Vorbelegung geprüft, nicht gegen leer: Preis, Datum und Ort
        sind beim Öffnen bereits gefüllt und sind für sich noch keine Eingabe.
        Ein Verkauf ist der teuerste Dialog im System — hier darf nichts
        verlorengehen.
      */
      dirty={
        price !== centsToInput(unit.salePriceCents) ||
        date !== new Date().toISOString().slice(0, 10) ||
        note.trim() !== "" ||
        channel !== "VOR_ORT" ||
        source !== "UNBEKANNT" ||
        region.trim() !== "" ||
        place !== locationLabel
      }
      title="Als verkauft markieren"
      description={`${unit.unitNumber}${article ? ` · ${unitLabel(article, unit)}` : ""}`}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
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

        {/*
          Herkunft. Getrennt vom Kanal, weil beides verschiedene Fragen
          beantwortet: der Kanal, wo abgewickelt wurde — die Herkunft, welche
          Werbung den Kunden gebracht hat.
        */}
        <div className="rounded-lg border border-skope-line bg-surface-sunken p-4">
          <p className="type-label">Herkunft des Kunden</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <SelectField
              label="Aufmerksam geworden über"
              options={SOURCE_OPTIONS}
              value={source}
              onChange={(event) =>
                setSource(event.target.value as CustomerSource)
              }
              hint={CUSTOMER_SOURCE_META[source].hint}
            />
            <TextField
              label="Ort / PLZ des Käufers"
              placeholder="optional — z. B. 21073 Hamburg"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
            />
            <TextField
              label="Übergabe"
              placeholder="Lager, Versand, Ladenlokal"
              value={place}
              onChange={(event) => setPlace(event.target.value)}
            />
          </div>
        </div>

        <TextareaField
          label="Notiz"
          rows={2}
          placeholder="optional — z. B. Zahlungsart, Käuferhinweis"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        {/* Live-Kalkulation */}
        <div className="rounded-lg border border-skope-line bg-surface-sunken p-4">
          <p className="type-label">Kalkulation</p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Einkauf" value={formatCents(unit.purchasePriceCents)} />
            <Row
              label="Reparaturen"
              value={formatCents(repairCostsCents(unit))}
            />
            <Row
              label="Weitere Kosten"
              value={formatCents(unit.additionalCostsCents)}
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
          <p className="mt-3 type-caption leading-relaxed text-muted-foreground">
            Operative Rechengröße ohne steuerliche Betrachtung. Eine mögliche
            Differenzbesteuerung ist hier bewusst nicht abgebildet.
          </p>
        </div>

        <div className="flex gap-2.5 rounded-lg border border-skope-accent/25 bg-skope-accent/6 p-3.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-skope-accent" />
          <p className="text-xs leading-relaxed text-foreground/85">
            Mit dem Erfassen wird das Gerät zentral auf <strong>VERKAUFT</strong>{" "}
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
