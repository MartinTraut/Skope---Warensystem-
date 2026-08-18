"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { AttributeFields, validateAttributes } from "./attribute-fields"
import { CategorySelect } from "./category-select"
import {
  MoneyField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/skope/form"
import { Modal } from "@/components/skope/modal"
import { StatusPill } from "@/components/skope/status-pill"
import { Button } from "@/components/ui/button"
import { useCategorySettings } from "@/hooks/use-cockpit"
import { repositories } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import { parseCents } from "@/lib/domain/money"
import { STOCK_MODE_META } from "@/lib/domain/status"
import { CONDITIONS, type Condition } from "@/lib/domain/types"
import { CONDITION_META } from "@/lib/domain/status"

const CONDITION_OPTIONS = CONDITIONS.map((condition) => ({
  value: condition,
  label: CONDITION_META[condition].label,
}))

interface Draft {
  categoryId: string
  name: string
  manufacturer: string
  mpn: string
  ean: string
  condition: Condition
  salePrice: string
  reorderLevel: string
  description: string
  attributes: Record<string, string>
}

function emptyDraft(categoryId = ""): Draft {
  return {
    categoryId,
    name: "",
    manufacturer: "",
    mpn: "",
    ean: "",
    condition: "GEBRAUCHT",
    salePrice: "",
    reorderLevel: "",
    description: "",
    attributes: {},
  }
}

/**
 * Neuen Artikel anlegen.
 *
 * Der Bereich steht bewusst ganz oben: Aus ihm folgen Nummernkreis,
 * Bestandsart, Merkmalsfelder und Verkaufskanal. Wer ihn zuletzt wählte,
 * müsste das halbe Formular noch einmal ausfüllen.
 */
export function NewArticleDialog({
  open,
  onOpenChange,
  defaultCategoryId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultCategoryId?: string
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaultCategoryId))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const settings = useCategorySettings(draft.categoryId || null)

  const dirty = useMemo(
    () =>
      draft.name.trim() !== "" ||
      draft.manufacturer.trim() !== "" ||
      draft.mpn.trim() !== "",
    [draft]
  )

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function close(next: boolean) {
    if (!next) {
      setDraft(emptyDraft(defaultCategoryId))
      setErrors({})
    }
    onOpenChange(next)
  }

  async function submit() {
    const nextErrors: Record<string, string> = {}
    if (!draft.categoryId) nextErrors.categoryId = "Bitte einen Bereich wählen."
    if (!draft.name.trim()) nextErrors.name = "Die Bezeichnung fehlt."

    const attributeErrors = validateAttributes(
      settings.attributes,
      draft.attributes
    )
    setErrors({ ...nextErrors, ...prefix(attributeErrors) })
    if (Object.keys(nextErrors).length > 0 || Object.keys(attributeErrors).length > 0) {
      return
    }

    setBusy(true)
    const created = await runAction(
      repositories.articles.create({
        categoryId: draft.categoryId,
        name: draft.name,
        manufacturer: draft.manufacturer,
        mpn: draft.mpn,
        ean: draft.ean,
        condition: draft.condition,
        salePriceCents: parseCents(draft.salePrice),
        reorderLevel: draft.reorderLevel
          ? Number.parseInt(draft.reorderLevel, 10)
          : null,
        description: draft.description,
        attributes: draft.attributes,
      }),
      { success: "Artikel angelegt", failure: "Artikel nicht angelegt" }
    )
    setBusy(false)

    if (!created) return
    close(false)
    router.push(`/inventory/${created.id}`)
  }

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Artikel anlegen"
      description="Der Bereich bestimmt Nummernkreis, Bestandsart, Merkmalsfelder und Verkaufskanal."
      size="lg"
      dirty={dirty}
      footer={
        <>
          <Button variant="outline" className="h-11 px-4" onClick={() => close(false)}>
            Abbrechen
          </Button>
          <Button className="h-11 px-5" onClick={submit} disabled={busy}>
            {busy ? "Wird angelegt …" : "Artikel anlegen"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <CategorySelect
            value={draft.categoryId}
            onChange={(categoryId) =>
              setDraft((current) => ({ ...current, categoryId, attributes: {} }))
            }
            required
            error={errors.categoryId}
          />
          {draft.categoryId && (
            <div className="flex items-end pb-1">
              <div className="space-y-1.5">
                <StatusPill tone={STOCK_MODE_META[settings.stockMode].tone} dot={false}>
                  {STOCK_MODE_META[settings.stockMode].label}
                </StatusPill>
                <p className="text-xs text-muted-foreground">
                  {STOCK_MODE_META[settings.stockMode].description}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Bezeichnung"
            required
            placeholder="Display / Bedieneinheit Pro 2"
            value={draft.name}
            error={errors.name}
            onChange={(event) => set("name", event.target.value)}
          />
          <TextField
            label="Hersteller"
            placeholder="Xiaomi"
            value={draft.manufacturer}
            onChange={(event) => set("manufacturer", event.target.value)}
          />
          <TextField
            label="Hersteller-Teilenummer"
            mono
            hint="Der zuverlässigste Schlüssel gegen Dubletten — und der Suchbegriff auf eBay."
            value={draft.mpn}
            onChange={(event) => set("mpn", event.target.value)}
          />
          <TextField
            label="EAN / Barcode"
            mono
            value={draft.ean}
            onChange={(event) => set("ean", event.target.value)}
          />
        </div>

        {settings.attributes.length > 0 && (
          <div className="space-y-3 rounded-lg border border-skope-line bg-surface-sunken p-4">
            <p className="type-label">Merkmale dieses Bereichs</p>
            <AttributeFields
              definitions={settings.attributes}
              values={draft.attributes}
              errors={unprefix(errors)}
              onChange={(key, value) =>
                setDraft((current) => ({
                  ...current,
                  attributes: { ...current.attributes, [key]: value },
                }))
              }
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Zustand"
            value={draft.condition}
            options={CONDITION_OPTIONS}
            onChange={(event) => set("condition", event.target.value as Condition)}
          />
          <MoneyField
            label="Verkaufspreis"
            hint="Kann später ergänzt werden."
            value={draft.salePrice}
            onChange={(event) => set("salePrice", event.target.value)}
          />
          {settings.stockMode === "MENGE" && (
            <TextField
              label="Meldebestand"
              inputMode="numeric"
              hint={
                settings.reorderLevel !== null
                  ? `Leer = ${settings.reorderLevel} aus dem Bereich.`
                  : "Warnung, sobald der Bestand darunter fällt."
              }
              value={draft.reorderLevel}
              onChange={(event) => set("reorderLevel", event.target.value)}
            />
          )}
        </div>

        <TextareaField
          label="Beschreibung"
          rows={3}
          hint="Wird als Grundlage für das Inserat verwendet."
          value={draft.description}
          onChange={(event) => set("description", event.target.value)}
        />
      </div>
    </Modal>
  )
}

/* Merkmalsfehler werden mit Präfix abgelegt, damit sie nicht mit Feldnamen
   des Formulars kollidieren — „name" gibt es in beiden Welten. */
function prefix(errors: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(errors).map(([key, value]) => [`attr:${key}`, value])
  )
}

function unprefix(errors: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(errors)
      .filter(([key]) => key.startsWith("attr:"))
      .map(([key, value]) => [key.slice(5), value])
  )
}
