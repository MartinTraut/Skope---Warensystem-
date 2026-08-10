"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Modal } from "@/components/skope/modal"
import { Button } from "@/components/ui/button"
import { MoneyField, SelectField, TextField, TextareaField } from "@/components/skope/form"
import { repositories } from "@/lib/data/demo-repository"
import { CONDITION_META } from "@/lib/domain/status"
import { parseCents } from "@/lib/domain/money"
import { CONDITIONS, type Condition } from "@/lib/domain/types"

interface FormState {
  manufacturer: string
  model: string
  variant: string
  color: string
  serialNumber: string
  mileageKm: string
  condition: Condition
  purchasePrice: string
  salePrice: string
  purchaseDate: string
  location: string
  notes: string
}

const EMPTY_FORM: FormState = {
  manufacturer: "",
  model: "",
  variant: "",
  color: "",
  serialNumber: "",
  mileageKm: "",
  condition: "GEBRAUCHT",
  purchasePrice: "",
  salePrice: "",
  purchaseDate: new Date().toISOString().slice(0, 10),
  location: "Wareneingang",
  notes: "",
}

const CONDITION_OPTIONS = CONDITIONS.map((condition) => ({
  value: condition,
  label: CONDITION_META[condition].label,
}))

/**
 * Manuelles Anlegen eines Scooters.
 *
 * Pflicht sind nur Hersteller, Modell und Seriennummer — alles andere kann in
 * der Werkstatt nachgetragen werden. Die Scooter-Nummer vergibt das System.
 */
export function NewScooterDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [saving, setSaving] = useState(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  function close() {
    onOpenChange(false)
    // Zurücksetzen erst nach der Schließ-Animation, sonst flackert der Inhalt.
    window.setTimeout(() => {
      setForm(EMPTY_FORM)
      setErrors({})
    }, 200)
  }

  async function handleSubmit() {
    const nextErrors: Partial<Record<keyof FormState, string>> = {}
    if (!form.manufacturer.trim()) nextErrors.manufacturer = "Pflichtfeld"
    if (!form.model.trim()) nextErrors.model = "Pflichtfeld"
    if (!form.serialNumber.trim()) nextErrors.serialNumber = "Pflichtfeld"

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setSaving(true)
    const result = await repositories.scooters.create({
      manufacturer: form.manufacturer,
      model: form.model,
      variant: form.variant,
      color: form.color,
      serialNumber: form.serialNumber,
      mileageKm: Number.parseInt(form.mileageKm, 10) || 0,
      condition: form.condition,
      purchasePriceCents: parseCents(form.purchasePrice) ?? 0,
      salePriceCents: parseCents(form.salePrice),
      purchaseDate: new Date(form.purchaseDate).toISOString(),
      location: form.location,
      notes: form.notes,
    })
    setSaving(false)

    if (!result.ok) {
      // Dubletten sind ein fachlicher Konflikt und gehören ans Feld, nicht in einen Toast allein.
      setErrors({ serialNumber: result.message })
      toast.error("Scooter nicht angelegt", { description: result.message })
      return
    }

    toast.success(`${result.data.scooterNumber} angelegt`, {
      description: "Der Scooter liegt jetzt im Wareneingang.",
    })
    close()
    router.push(`/scooters/${result.data.id}`)
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Scooter hinzufügen"
      description="Die Scooter-Nummer wird automatisch vergeben."
      size="lg"
      footer={
        <>
          <Button variant="outline" className="h-10 px-4" onClick={close}>
            Abbrechen
          </Button>
          <Button className="h-10 px-4" onClick={handleSubmit} disabled={saving}>
            {saving ? "Wird angelegt …" : "Scooter anlegen"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Hersteller"
          required
          placeholder="z. B. Segway-Ninebot"
          value={form.manufacturer}
          error={errors.manufacturer}
          onChange={(event) => set("manufacturer", event.target.value)}
        />
        <TextField
          label="Modell"
          required
          placeholder="z. B. KickScooter MAX G2"
          value={form.model}
          error={errors.model}
          onChange={(event) => set("model", event.target.value)}
        />
        <TextField
          label="Variante"
          placeholder="optional"
          value={form.variant}
          onChange={(event) => set("variant", event.target.value)}
        />
        <TextField
          label="Farbe"
          placeholder="z. B. Schwarz"
          value={form.color}
          onChange={(event) => set("color", event.target.value)}
        />
        <TextField
          label="Seriennummer"
          required
          mono
          placeholder="Seriennummer vom Typenschild"
          hint="Dient der Dublettenprüfung."
          value={form.serialNumber}
          error={errors.serialNumber}
          onChange={(event) => set("serialNumber", event.target.value)}
        />
        <TextField
          label="Kilometerstand"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="0"
          value={form.mileageKm}
          onChange={(event) => set("mileageKm", event.target.value)}
        />
        <SelectField
          label="Zustand"
          options={CONDITION_OPTIONS}
          value={form.condition}
          onChange={(event) => set("condition", event.target.value as Condition)}
        />
        <TextField
          label="Standort"
          value={form.location}
          onChange={(event) => set("location", event.target.value)}
        />
        <MoneyField
          label="Einkaufspreis"
          value={form.purchasePrice}
          onChange={(event) => set("purchasePrice", event.target.value)}
        />
        <MoneyField
          label="Verkaufspreis"
          hint="Kann später kalkuliert werden."
          value={form.salePrice}
          onChange={(event) => set("salePrice", event.target.value)}
        />
        <TextField
          label="Einkaufsdatum"
          type="date"
          value={form.purchaseDate}
          onChange={(event) => set("purchaseDate", event.target.value)}
        />
        <TextareaField
          label="Notizen"
          rows={3}
          className="sm:col-span-2"
          placeholder="Auffälligkeiten, Zubehör, Hinweise vom Lieferanten …"
          value={form.notes}
          onChange={(event) => set("notes", event.target.value)}
        />
      </div>
    </Modal>
  )
}
