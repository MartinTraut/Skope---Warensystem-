"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"

import { AttributeFields, validateAttributes } from "./attribute-fields"
import { Modal } from "@/components/skope/modal"
import { Button } from "@/components/ui/button"
import {
  MoneyField,
  SelectField,
  TextField,
  TextareaField,
  focusFirstInvalid,
} from "@/components/skope/form"
import { useCategorySettings } from "@/hooks/use-cockpit"
import { repositories } from "@/lib/data/demo-repository"
import { centsToInput, parseCents } from "@/lib/domain/money"
import { CHANNEL_META, CONDITION_META, PUBLISH_MODE_META } from "@/lib/domain/status"
import {
  CHANNELS,
  CONDITIONS,
  PUBLISH_MODES,
  type Article,
  type Channel,
  type Condition,
  type PublishMode,
} from "@/lib/domain/types"

/**
 * Artikelstammdaten bearbeiten.
 *
 * Bereich und Bestandsart fehlen hier bewusst: Beide sind beim Anlegen
 * festgeschrieben. Ein nachträglicher Wechsel der Bestandsart würde aus 40
 * gebuchten Bremsbelägen 40 einzeln zu prüfende Geräte machen.
 */
export function EditArticleDialog({
  article,
  open,
  onOpenChange,
}: {
  article: Article
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const settings = useCategorySettings(article.categoryId)
  const [form, setForm] = useState(() => toForm(article))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)

  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm(toForm(article))
      setErrors({})
    }
  }

  function set<K extends keyof ReturnType<typeof toForm>>(
    key: K,
    value: ReturnType<typeof toForm>[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    const attributeErrors = validateAttributes(settings.attributes, form.attributes)
    if (Object.keys(attributeErrors).length > 0) {
      setErrors(attributeErrors)
      focusFirstInvalid(formRef.current)
      return
    }
    if (!form.name.trim()) {
      setErrors({ name: "Ohne Bezeichnung lässt sich der Artikel nicht finden." })
      focusFirstInvalid(formRef.current)
      return
    }

    setErrors({})
    setSaving(true)

    const result = await repositories.articles.update(article.id, {
      name: form.name.trim(),
      manufacturer: form.manufacturer.trim(),
      mpn: form.mpn.trim(),
      ean: form.ean.trim(),
      description: form.description,
      notes: form.notes,
      condition: form.condition,
      salePriceCents: parseCents(form.salePrice),
      reorderLevel:
        form.reorderLevel.trim() === ""
          ? null
          : Number.parseInt(form.reorderLevel, 10),
      channelOverride: form.channelOverride
        ? (form.channelOverride as Channel)
        : null,
      publishModeOverride: form.publishModeOverride
        ? (form.publishModeOverride as PublishMode)
        : null,
      attributes: form.attributes,
    })

    setSaving(false)

    if (!result.ok) {
      toast.error("Nicht gespeichert", { description: result.message })
      return
    }

    onOpenChange(false)
    toast.success("Änderungen gespeichert")
  }

  const isBulk = article.stockMode === "MENGE"

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      dirty={JSON.stringify(form) !== JSON.stringify(toForm(article))}
      title="Artikel bearbeiten"
      description={`${article.sku} · ${settings.pathLabel}`}
      size="lg"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Wird gespeichert …" : "Speichern"}
          </Button>
        </>
      }
    >
      <div className="space-y-6" ref={formRef}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Bezeichnung"
            required
            error={errors.name}
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
          />
          <TextField
            label="Hersteller"
            value={form.manufacturer}
            onChange={(event) => set("manufacturer", event.target.value)}
          />
          <TextField
            label="Hersteller-Teilenummer"
            mono
            hint="Bester Dublettenschlüssel beim Import."
            value={form.mpn}
            onChange={(event) => set("mpn", event.target.value)}
          />
          <TextField
            label="EAN"
            mono
            value={form.ean}
            onChange={(event) => set("ean", event.target.value)}
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
          <MoneyField
            label="Verkaufspreis"
            hint={isBulk ? "Preis je Stück." : "Richtpreis; Geräte rechnen einzeln."}
            value={form.salePrice}
            onChange={(event) => set("salePrice", event.target.value)}
          />
          {isBulk && (
            <TextField
              label="Meldebestand"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={
                settings.reorderLevel === null
                  ? "keine Überwachung"
                  : `Bereich: ${settings.reorderLevel}`
              }
              hint="Leer lassen, um den Wert des Bereichs zu übernehmen."
              value={form.reorderLevel}
              onChange={(event) => set("reorderLevel", event.target.value)}
            />
          )}
        </div>

        <TextareaField
          label="Beschreibung"
          hint="Wird als Inseratstext übernommen."
          rows={4}
          value={form.description}
          onChange={(event) => set("description", event.target.value)}
        />

        {settings.attributes.length > 0 && (
          <div>
            <p className="type-label mb-2">Merkmale</p>
            <AttributeFields
              definitions={settings.attributes}
              values={form.attributes}
              errors={errors}
              onChange={(key, value) =>
                setForm((current) => ({
                  ...current,
                  attributes: { ...current.attributes, [key]: value },
                }))
              }
            />
          </div>
        )}

        <div>
          <p className="type-label mb-2">Veröffentlichung</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Kanal"
              placeholder={
                settings.defaultChannel
                  ? `Bereich: ${CHANNEL_META[settings.defaultChannel].label}`
                  : "Kein Kanal im Bereich"
              }
              hint="Leer lassen, um dem Bereich zu folgen."
              value={form.channelOverride}
              onChange={(event) => set("channelOverride", event.target.value)}
              options={CHANNELS.map((channel) => ({
                value: channel,
                label: CHANNEL_META[channel].label,
              }))}
            />
            <SelectField
              label="Automatikstufe"
              placeholder={`Bereich: ${PUBLISH_MODE_META[settings.publishMode].label}`}
              hint="Leer lassen, um dem Bereich zu folgen."
              value={form.publishModeOverride}
              onChange={(event) => set("publishModeOverride", event.target.value)}
              options={PUBLISH_MODES.map((mode) => ({
                value: mode,
                label: PUBLISH_MODE_META[mode].label,
              }))}
            />
          </div>
        </div>

        <TextareaField
          label="Interne Notizen"
          rows={2}
          value={form.notes}
          onChange={(event) => set("notes", event.target.value)}
        />
      </div>
    </Modal>
  )
}

function toForm(article: Article) {
  return {
    name: article.name,
    manufacturer: article.manufacturer,
    mpn: article.mpn,
    ean: article.ean,
    description: article.description,
    notes: article.notes,
    condition: article.condition,
    salePrice: centsToInput(article.salePriceCents),
    reorderLevel:
      article.reorderLevel === null ? "" : String(article.reorderLevel),
    channelOverride: article.channelOverride ?? "",
    publishModeOverride: article.publishModeOverride ?? "",
    attributes: { ...article.attributes },
  }
}
