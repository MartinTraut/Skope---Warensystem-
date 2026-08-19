"use client"

import { useState } from "react"

import { Modal } from "@/components/skope/modal"
import { Button } from "@/components/ui/button"
import {
  MoneyField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/skope/form"
import { useLocations, useStockLevel } from "@/hooks/use-cockpit"
import { repositories } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import { centsToInput, formatCents, parseCents } from "@/lib/domain/money"
import { CUSTOMER_SOURCE_META, SALE_CHANNEL_META } from "@/lib/domain/status"
import { checkAvailability, quantityAt } from "@/lib/domain/stock"
import {
  CUSTOMER_SOURCES,
  SALE_CHANNELS,
  type Article,
  type CustomerSource,
  type SaleChannel,
} from "@/lib/domain/types"

/**
 * Buchungsdialoge für Mengenartikel.
 *
 * Alle vier folgen demselben Aufbau, weil sie dieselbe Frage stellen: wie
 * viel, von welchem Platz, und warum. Der Bestand ist die Summe dieser
 * Buchungen — ein Feld zum Überschreiben gibt es bewusst nirgends.
 */

interface DialogProps {
  article: Article
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Auswahl der Lagerplätze inklusive „ohne Platz". */
function useLocationOptions(withEmpty = true) {
  const locations = useLocations()
  const options = locations.map((location) => ({
    value: location.id,
    label: `${location.code} – ${location.name}`,
  }))
  return withEmpty
    ? [{ value: "", label: "Ohne Lagerplatz" }, ...options]
    : options
}

function Footer({
  onCancel,
  onSubmit,
  busy,
  label,
  disabled,
}: {
  onCancel: () => void
  onSubmit: () => void
  busy: boolean
  label: string
  disabled?: boolean
}) {
  return (
    <>
      <Button variant="outline" className="h-10 px-4" onClick={onCancel}>
        Abbrechen
      </Button>
      <Button
        className="h-10 px-4"
        onClick={onSubmit}
        disabled={busy || disabled}
      >
        {busy ? "Wird gebucht …" : label}
      </Button>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Zugang                                                              */
/* ------------------------------------------------------------------ */

export function ReceiveDialog({ article, open, onOpenChange }: DialogProps) {
  const level = useStockLevel(article.id)
  const locationOptions = useLocationOptions()
  const [quantity, setQuantity] = useState("1")
  const [cost, setCost] = useState(centsToInput(level.averageCostCents || null))
  const [locationId, setLocationId] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function submit() {
    const amount = Number.parseInt(quantity, 10)
    if (!Number.isInteger(amount) || amount <= 0) {
      setErrors({ quantity: "Die Menge muss größer als null sein." })
      return
    }
    const unitCost = parseCents(cost)
    if (unitCost === null) {
      // Der Preis wird am Preisfeld beanstandet, nicht am Mengenfeld: Ein
      // Fehlertext unter der Menge, der vom Einstandspreis handelt, schickt
      // den Blick an die falsche Stelle.
      setErrors({ cost: "Einstandspreis konnte nicht gelesen werden." })
      return
    }

    setErrors({})
    setBusy(true)
    const result = await runAction(
      repositories.stock.receive({
        articleId: article.id,
        quantity: amount,
        unitCostCents: unitCost,
        locationId: locationId || null,
        note,
      }),
      {
        success: `${amount} Stück zugebucht`,
        failure: "Zugang nicht gebucht",
      }
    )
    setBusy(false)
    if (result) onOpenChange(false)
  }

  /*
    Eine ausgefüllte Buchung ist Arbeit: Menge, Preis, Platz, Notiz. Ein
    Fehltipp neben das Blatt hat sie bisher wortlos verworfen — deshalb fragt
    der Dialog nach, sobald etwas darin steht.
  */
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Zugang buchen"
      description={`${article.sku} · ${article.name}`}
      dirty={note.trim() !== "" || quantity !== "1"}
      footer={
        <Footer
          onCancel={() => onOpenChange(false)}
          onSubmit={submit}
          busy={busy}
          label="Zugang buchen"
        />
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Menge"
            type="number"
            inputMode="numeric"
            min={1}
            required
            value={quantity}
            error={errors.quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          <MoneyField
            label="Einstandspreis je Stück"
            hint="Bestimmt den gleitenden Durchschnittswert."
            error={errors.cost}
            required
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
        </div>
        <SelectField
          label="Lagerplatz"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          options={locationOptions}
        />
        <TextareaField
          label="Notiz"
          rows={2}
          placeholder="z. B. Lieferung Avides, Karton 3"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Abgang                                                              */
/* ------------------------------------------------------------------ */

export function IssueDialog({ article, open, onOpenChange }: DialogProps) {
  const level = useStockLevel(article.id)
  const locationOptions = useLocationOptions()
  const [quantity, setQuantity] = useState("1")
  const [type, setType] = useState<"VERBRAUCH" | "VERLUST">("VERBRAUCH")
  const [locationId, setLocationId] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function submit() {
    const amount = Number.parseInt(quantity, 10)
    const problem = checkAvailability(level, amount)
    if (problem) {
      setErrors({ quantity: problem })
      return
    }

    setErrors({})
    setBusy(true)
    const result = await runAction(
      repositories.stock.issue({
        articleId: article.id,
        quantity: amount,
        type,
        locationId: locationId || null,
        note,
      }),
      { success: `${amount} Stück abgebucht`, failure: "Abgang nicht gebucht" }
    )
    setBusy(false)
    if (result) onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Abgang buchen"
      dirty={note.trim() !== "" || quantity !== "1"}
      description={`${article.sku} · Bestand ${level.quantity} Stück`}
      footer={
        <Footer
          onCancel={() => onOpenChange(false)}
          onSubmit={submit}
          busy={busy}
          label="Abgang buchen"
        />
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Menge"
            type="number"
            inputMode="numeric"
            min={1}
            required
            value={quantity}
            error={errors.quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          <SelectField
            label="Grund"
            value={type}
            onChange={(event) =>
              setType(event.target.value as "VERBRAUCH" | "VERLUST")
            }
            options={[
              { value: "VERBRAUCH", label: "Verbrauch (Einbau, Werkstatt)" },
              { value: "VERLUST", label: "Verlust (Bruch, Entsorgung)" },
            ]}
          />
        </div>
        <SelectField
          label="Lagerplatz"
          hint={
            locationId
              ? `Dort liegen ${quantityAt(level, locationId)} Stück.`
              : undefined
          }
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          options={locationOptions}
        />
        <TextareaField
          label="Notiz"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Umlagerung                                                          */
/* ------------------------------------------------------------------ */

export function TransferDialog({ article, open, onOpenChange }: DialogProps) {
  const level = useStockLevel(article.id)
  const locationOptions = useLocationOptions()
  const [quantity, setQuantity] = useState("1")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function submit() {
    const amount = Number.parseInt(quantity, 10)
    if (!Number.isInteger(amount) || amount <= 0) {
      setErrors({ quantity: "Die Menge muss größer als null sein." })
      return
    }
    if (from === to) {
      setErrors({ to: "Quelle und Ziel sind derselbe Platz." })
      return
    }
    if (amount > quantityAt(level, from || null)) {
      setErrors({
        from: `Am Quellplatz liegen nur ${quantityAt(level, from || null)} Stück.`,
      })
      return
    }

    setErrors({})
    setBusy(true)
    const result = await runAction(
      repositories.stock.transfer({
        articleId: article.id,
        quantity: amount,
        fromLocationId: from || null,
        toLocationId: to || null,
        note,
      }),
      { success: "Umlagerung gebucht", failure: "Umlagerung nicht gebucht" }
    )
    setBusy(false)
    if (result) onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Umlagern"
      dirty={note.trim() !== "" || quantity !== "1" || from !== "" || to !== ""}
      description={`${article.sku} · ${article.name}`}
      footer={
        <Footer
          onCancel={() => onOpenChange(false)}
          onSubmit={submit}
          busy={busy}
          label="Umlagern"
        />
      }
    >
      <div className="space-y-4">
        <TextField
          label="Menge"
          type="number"
          inputMode="numeric"
          min={1}
          required
          value={quantity}
          error={errors.quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Von"
            hint={`${quantityAt(level, from || null)} Stück vorhanden`}
            error={errors.from}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            options={locationOptions}
          />
          <SelectField
            label="Nach"
            error={errors.to}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            options={locationOptions}
          />
        </div>
        <TextareaField
          label="Notiz"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Verkauf einer Menge                                                 */
/* ------------------------------------------------------------------ */

export function SellQuantityDialog({ article, open, onOpenChange }: DialogProps) {
  const level = useStockLevel(article.id)
  const locationOptions = useLocationOptions()
  const [quantity, setQuantity] = useState("1")
  const [price, setPrice] = useState(centsToInput(article.salePriceCents))
  const [channel, setChannel] = useState<SaleChannel>("EBAY")
  const [source, setSource] = useState<CustomerSource>("EBAY")
  const [region, setRegion] = useState("")
  const [saleLocation, setSaleLocation] = useState("Versand")
  const [locationId, setLocationId] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const amount = Number.parseInt(quantity, 10)
  const priceCents = parseCents(price)
  const total =
    Number.isFinite(amount) && priceCents !== null ? amount * priceCents : null

  async function submit() {
    const problem = checkAvailability(level, amount)
    if (problem) {
      setErrors({ quantity: problem })
      return
    }
    if (priceCents === null || priceCents <= 0) {
      setErrors({ price: "Verkaufspreis konnte nicht gelesen werden." })
      return
    }

    setErrors({})
    setBusy(true)
    const result = await runAction(
      repositories.stock.sell({
        articleId: article.id,
        quantity: amount,
        locationId: locationId || null,
        // Gebucht wird der Gesamterlös: Der Einstand wird im Repository
        // ebenfalls als Menge × Durchschnittspreis gegengerechnet.
        salePriceCents: priceCents * amount,
        channel,
        customerSource: source,
        customerRegion: region,
        saleLocation,
        soldAt: new Date().toISOString(),
        note,
      }),
      { success: "Verkauf gebucht", failure: "Verkauf nicht gebucht" }
    )
    setBusy(false)
    if (result) onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Verkauf buchen"
      dirty={note.trim() !== "" || quantity !== "1" || region.trim() !== ""}
      description={`${article.sku} · Bestand ${level.quantity} Stück`}
      size="lg"
      footer={
        <Footer
          onCancel={() => onOpenChange(false)}
          onSubmit={submit}
          busy={busy}
          label="Verkauf buchen"
        />
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Menge"
            type="number"
            inputMode="numeric"
            min={1}
            required
            value={quantity}
            error={errors.quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          <MoneyField
            label="Verkaufspreis je Stück"
            hint={total !== null ? `Gesamt ${formatCents(total)}` : undefined}
            error={errors.price}
            required
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
          <SelectField
            label="Verkaufskanal"
            value={channel}
            onChange={(event) => setChannel(event.target.value as SaleChannel)}
            options={SALE_CHANNELS.map((entry) => ({
              value: entry,
              label: SALE_CHANNEL_META[entry].label,
            }))}
          />
          <SelectField
            label="Kundenherkunft"
            value={source}
            onChange={(event) => setSource(event.target.value as CustomerSource)}
            options={CUSTOMER_SOURCES.map((entry) => ({
              value: entry,
              label: CUSTOMER_SOURCE_META[entry].label,
            }))}
          />
          <TextField
            label="Region des Käufers"
            placeholder="optional, z. B. 44137 Dortmund"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
          />
          <TextField
            label="Übergabe"
            value={saleLocation}
            onChange={(event) => setSaleLocation(event.target.value)}
          />
          <SelectField
            label="Entnahme vom Lagerplatz"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            options={locationOptions}
          />
        </div>
        <TextareaField
          label="Notiz"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
    </Modal>
  )
}
