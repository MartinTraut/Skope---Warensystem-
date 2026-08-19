"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { CategorySelect } from "@/components/inventory/category-select"
import {
  Field,
  MoneyField,
  SelectField,
  TextField,
  TextareaField,
  focusFirstInvalid,
} from "@/components/skope/form"
import { Modal } from "@/components/skope/modal"
import { Button } from "@/components/ui/button"
import {
  useArticles,
  useCategorySettings,
  useLocations,
} from "@/hooks/use-cockpit"
import { repositories } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import { articleLabel } from "@/lib/domain/article-factory"
import { parseCents } from "@/lib/domain/money"
import { CONDITION_META } from "@/lib/domain/status"
import { CONDITIONS, type Condition } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

const CONDITION_OPTIONS = CONDITIONS.map((condition) => ({
  value: condition,
  label: CONDITION_META[condition].label,
}))

interface Draft {
  categoryId: string
  articleId: string
  /** Wenn kein passendes Modell existiert, wird es hier gleich mit angelegt. */
  newArticleName: string
  newArticleManufacturer: string
  serialNumber: string
  variant: string
  color: string
  mileageKm: string
  condition: Condition
  purchasePrice: string
  additionalCosts: string
  salePrice: string
  locationId: string
  abe: boolean
  notes: string
}

function emptyDraft(categoryId = ""): Draft {
  return {
    categoryId,
    articleId: "",
    newArticleName: "",
    newArticleManufacturer: "",
    serialNumber: "",
    variant: "",
    color: "",
    mileageKm: "",
    condition: "GEBRAUCHT",
    purchasePrice: "",
    additionalCosts: "",
    salePrice: "",
    locationId: "",
    abe: false,
    notes: "",
  }
}

/**
 * Einzelnes Gerät erfassen.
 *
 * Zweistufig, weil das Modell und das Gerät zwei verschiedene Dinge sind: Der
 * Artikel „Xiaomi Pro 2" existiert einmal, die zehn Geräte dazu einzeln. Wer
 * ein Modell erfasst, das es noch nicht gibt, legt es hier mit an — sonst
 * müsste vor jedem Wareneingang ein zweiter Dialog geöffnet werden.
 */
export function NewUnitDialog({
  open,
  onOpenChange,
  defaultCategoryId,
  defaultArticleId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultCategoryId?: string
  defaultArticleId?: string
}) {
  const router = useRouter()
  const articles = useArticles()
  const locations = useLocations()
  const [draft, setDraft] = useState<Draft>(() => ({
    ...emptyDraft(defaultCategoryId),
    articleId: defaultArticleId ?? "",
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)

  const settings = useCategorySettings(draft.categoryId || null)

  const candidates = useMemo(
    () =>
      articles
        .filter(
          (article) =>
            article.stockMode === "SERIALISIERT" &&
            article.archivedAt === null &&
            (!draft.categoryId || article.categoryId === draft.categoryId)
        )
        .sort((a, b) => articleLabel(a).localeCompare(articleLabel(b), "de")),
    [articles, draft.categoryId]
  )

  const creatingArticle = draft.articleId === "__neu"
  const dirty = draft.serialNumber.trim() !== "" || draft.articleId !== ""

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function close(next: boolean) {
    if (!next) {
      setDraft({ ...emptyDraft(defaultCategoryId), articleId: defaultArticleId ?? "" })
      setErrors({})
    }
    onOpenChange(next)
  }

  async function submit() {
    const nextErrors: Record<string, string> = {}
    if (!draft.categoryId) nextErrors.categoryId = "Bitte einen Bereich wählen."
    if (!draft.articleId) nextErrors.articleId = "Bitte ein Modell wählen."
    if (creatingArticle && !draft.newArticleName.trim()) {
      nextErrors.newArticleName = "Die Modellbezeichnung fehlt."
    }
    if (!draft.serialNumber.trim()) {
      nextErrors.serialNumber = "Ohne Seriennummer lässt sich das Gerät nicht eindeutig führen."
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalid(formRef.current)
      return
    }

    setBusy(true)

    let articleId = draft.articleId
    if (creatingArticle) {
      const article = await runAction(
        repositories.articles.create({
          categoryId: draft.categoryId,
          name: draft.newArticleName,
          manufacturer: draft.newArticleManufacturer,
        }),
        { failure: "Modell nicht angelegt" }
      )
      if (!article) {
        setBusy(false)
        return
      }
      articleId = article.id
    }

    const unit = await runAction(
      repositories.units.create({
        articleId,
        serialNumber: draft.serialNumber,
        variant: draft.variant,
        color: draft.color,
        mileageKm: draft.mileageKm ? Number.parseInt(draft.mileageKm, 10) : 0,
        condition: draft.condition,
        purchasePriceCents: parseCents(draft.purchasePrice) ?? 0,
        additionalCostsCents: parseCents(draft.additionalCosts) ?? 0,
        salePriceCents: parseCents(draft.salePrice),
        locationId: draft.locationId || null,
        notes: draft.notes,
        documents: {
          abe: draft.abe,
          invoice: false,
          other: false,
          note: "",
        },
      }),
      { success: "Gerät erfasst", failure: "Gerät nicht erfasst" }
    )
    setBusy(false)

    if (!unit) return
    close(false)
    router.push(`/units/${unit.id}`)
  }

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Gerät erfassen"
      description="Ein einzeln geführtes Gerät mit eigener Nummer, eigenem Prüfprotokoll und eigener Marge."
      size="lg"
      dirty={dirty}
      footer={
        <>
          <Button variant="outline" className="h-11 px-4" onClick={() => close(false)}>
            Abbrechen
          </Button>
          <Button className="h-11 px-5" onClick={submit} disabled={busy}>
            {busy ? "Wird erfasst …" : "Gerät erfassen"}
          </Button>
        </>
      }
    >
      <div className="space-y-5" ref={formRef}>
        <div className="grid gap-4 sm:grid-cols-2">
          <CategorySelect
            value={draft.categoryId}
            stockMode="SERIALISIERT"
            onChange={(categoryId) =>
              setDraft((current) => ({ ...current, categoryId, articleId: "" }))
            }
            required
            error={errors.categoryId}
            hint="Nur Bereiche, die Einzelstücke führen."
          />

          <Field label="Modell" required error={errors.articleId}>
            {(control) => (
              <select
                {...control}
                value={draft.articleId}
                onChange={(event) => set("articleId", event.target.value)}
                disabled={!draft.categoryId}
                className={cn(
                  "h-11 w-full rounded-lg border border-skope-line-strong bg-[#0b0c0e] px-3 text-sm text-foreground",
                  "outline-none focus:border-skope-accent/60 focus:ring-3 focus:ring-skope-accent/15",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  errors.articleId && "border-state-error/60"
                )}
              >
                <option value="">Bitte wählen</option>
                {candidates.map((article) => (
                  <option key={article.id} value={article.id}>
                    {articleLabel(article)}
                  </option>
                ))}
                <option value="__neu">+ Neues Modell anlegen</option>
              </select>
            )}
          </Field>
        </div>

        {creatingArticle && (
          <div className="grid gap-4 rounded-lg border border-skope-line bg-surface-sunken p-4 sm:grid-cols-2">
            <TextField
              label="Modellbezeichnung"
              required
              placeholder="Mi Electric Scooter Pro 2"
              value={draft.newArticleName}
              error={errors.newArticleName}
              onChange={(event) => set("newArticleName", event.target.value)}
            />
            <TextField
              label="Hersteller"
              placeholder="Xiaomi"
              value={draft.newArticleManufacturer}
              onChange={(event) => set("newArticleManufacturer", event.target.value)}
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Seriennummer"
            required
            mono
            value={draft.serialNumber}
            error={errors.serialNumber}
            onChange={(event) => set("serialNumber", event.target.value)}
          />
          <TextField
            label="Variante"
            value={draft.variant}
            onChange={(event) => set("variant", event.target.value)}
          />
          <TextField
            label="Farbe"
            value={draft.color}
            onChange={(event) => set("color", event.target.value)}
          />
          <TextField
            label="Laufleistung (km)"
            inputMode="numeric"
            value={draft.mileageKm}
            onChange={(event) => set("mileageKm", event.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Zustand"
            value={draft.condition}
            options={CONDITION_OPTIONS}
            onChange={(event) => set("condition", event.target.value as Condition)}
          />
          <MoneyField
            label="Einkaufspreis"
            value={draft.purchasePrice}
            onChange={(event) => set("purchasePrice", event.target.value)}
          />
          <MoneyField
            label="Nebenkosten"
            hint="Transport, Aufbereitungsmaterial."
            value={draft.additionalCosts}
            onChange={(event) => set("additionalCosts", event.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField
            label="Verkaufspreis"
            hint="Kann nach der Prüfung ergänzt werden."
            value={draft.salePrice}
            onChange={(event) => set("salePrice", event.target.value)}
          />
          <SelectField
            label="Lagerplatz"
            placeholder="Ohne Lagerplatz"
            value={draft.locationId}
            options={locations.map((location) => ({
              value: location.id,
              label: `${location.code} – ${location.name}`,
            }))}
            onChange={(event) => set("locationId", event.target.value)}
          />
        </div>

        {settings.requiresInspection && (
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-skope-line bg-surface-sunken px-3.5 py-3">
            <input
              type="checkbox"
              checked={draft.abe}
              onChange={(event) => set("abe", event.target.checked)}
              className="size-4 accent-[#8ee506]"
            />
            <span className="text-sm text-foreground">
              ABE / Betriebserlaubnis liegt bei
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Ohne sie lässt sich das Gerät später nicht verkaufsbereit setzen.
              </span>
            </span>
          </label>
        )}

        <TextareaField
          label="Notiz"
          rows={2}
          value={draft.notes}
          onChange={(event) => set("notes", event.target.value)}
        />
      </div>
    </Modal>
  )
}
