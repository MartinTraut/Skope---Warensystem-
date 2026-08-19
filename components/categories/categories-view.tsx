"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ChevronRight,
  FolderTree,
  Layers,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"

import { AttributeEditor } from "./attribute-editor"
import { StockModeBadge } from "@/components/shared/badges"
import { ConfirmDialog } from "@/components/skope/confirm-dialog"
import { Modal } from "@/components/skope/modal"
import {
  SelectField,
  TextField,
  TextareaField,
  ToggleRow,
} from "@/components/skope/form"
import {
  EmptyState,
  Metric,
  Panel,
  PanelHeader,
  PageHeader,
} from "@/components/skope/primitives"
import { ListSkeleton, MetricGridSkeleton } from "@/components/skope/skeletons"
import { StatusPill } from "@/components/skope/status-pill"
import { TOUCH_EXTEND } from "@/components/skope/focus"
import { Button } from "@/components/ui/button"
import {
  useArticles,
  useCategories,
  useHydrated,
} from "@/hooks/use-cockpit"
import { repositories } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import {
  canChangeStockMode,
  childrenOf,
  resolveCategorySettings,
  suggestPrefix,
  validateCategory,
} from "@/lib/domain/categories"
import { formatNumber } from "@/lib/domain/money"
import { CHANNEL_META, PUBLISH_MODE_META } from "@/lib/domain/status"
import {
  CHANNELS,
  PUBLISH_MODES,
  STOCK_MODES,
  type AttributeDefinition,
  type Category,
  type Channel,
  type PublishMode,
  type StockMode,
} from "@/lib/domain/types"
import { STOCK_MODE_META } from "@/lib/domain/status"
import { cn } from "@/lib/utils"

/**
 * Bereiche — der Baum, an dem alles andere hängt.
 *
 * Nummernkreis, Merkmalsfelder, Meldebestand, Zielkanal und Automatikstufe
 * kommen von hier und erben sich nach unten weiter. Was auf einer Ebene nicht
 * gesetzt ist, holt sich der Zweig von oben; Merkmalsfelder sammeln sich über
 * den Pfad an, statt überschrieben zu werden.
 */
export function CategoriesView() {
  const hydrated = useHydrated()
  const categories = useCategories()
  const articles = useArticles()

  const [editing, setEditing] = useState<Category | null>(null)
  const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(
    undefined
  )
  const [removing, setRemoving] = useState<Category | null>(null)

  const articleCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const article of articles) {
      map.set(article.categoryId, (map.get(article.categoryId) ?? 0) + 1)
    }
    return map
  }, [articles])

  const roots = childrenOf(categories, null)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bereiche"
        description="Eigene Struktur für Scooter, Ersatzteile und alles Weitere. Nummernkreis, Merkmalsfelder und Kanalregel gelten für den Bereich und erben sich nach unten."
        actions={
          <Button
            className="h-10 gap-2 px-4"
            onClick={() => setCreatingUnder(null)}
          >
            <Plus className="size-4" />
            Bereich anlegen
          </Button>
        }
      />

      {!hydrated ? (
        <MetricGridSkeleton count={3} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Bereiche" value={formatNumber(categories.length)} />
          <Metric
            label="Oberste Ebene"
            value={formatNumber(roots.length)}
            hint="z. B. Scooter, Ersatzteile"
          />
          <Metric
            label="Merkmalsfelder"
            value={formatNumber(
              categories.reduce(
                (sum, category) => sum + category.attributes.length,
                0
              )
            )}
            hint="machen den Bestand auswertbar"
          />
        </div>
      )}

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Struktur"
          description="Artikel gehören immer an ein Blatt — Zwischenebenen sind reine Gliederung."
        />
        {!hydrated ? (
          <ListSkeleton rows={6} />
        ) : categories.length === 0 ? (
          <EmptyState
            icon={<FolderTree className="size-5" />}
            title="Noch kein Bereich"
            description="Beginne mit den groben Blöcken — etwa „Scooter“ und „Ersatzteile“ — und verfeinere sie danach."
            action={
              <Button className="h-10 px-4" onClick={() => setCreatingUnder(null)}>
                Ersten Bereich anlegen
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-skope-line">
            {roots.map((category) => (
              <CategoryNode
                key={category.id}
                category={category}
                categories={categories}
                articleCount={articleCount}
                depth={0}
                onEdit={setEditing}
                onAddChild={(parentId) => setCreatingUnder(parentId)}
                onRemove={setRemoving}
              />
            ))}
          </ul>
        )}
      </Panel>

      <CategoryDialog
        category={editing}
        parentId={creatingUnder}
        open={editing !== null || creatingUnder !== undefined}
        articleCount={editing ? (articleCount.get(editing.id) ?? 0) : 0}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
            setCreatingUnder(undefined)
          }
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Bereich löschen"
        description={
          removing
            ? `„${removing.name}" wird entfernt. Solange Artikel oder Unterbereiche daran hängen, lehnt das System das Löschen ab — ein Artikel ohne Bereich hätte weder Nummernkreis noch Merkmalsfelder.`
            : ""
        }
        onConfirm={async () => {
          if (!removing) return
          await runAction(repositories.categories.remove(removing.id), {
            success: "Bereich gelöscht",
            failure: "Bereich nicht gelöscht",
          })
          setRemoving(null)
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Baumknoten                                                          */
/* ------------------------------------------------------------------ */

function CategoryNode({
  category,
  categories,
  articleCount,
  depth,
  onEdit,
  onAddChild,
  onRemove,
}: {
  category: Category
  categories: Category[]
  articleCount: Map<string, number>
  depth: number
  onEdit: (category: Category) => void
  onAddChild: (parentId: string) => void
  onRemove: (category: Category) => void
}) {
  const children = childrenOf(categories, category.id)
  const settings = resolveCategorySettings(categories, category.id)
  const count = articleCount.get(category.id) ?? 0

  return (
    <>
      <li
        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-surface-sunken sm:px-5"
        style={{ paddingLeft: `calc(1rem + ${depth * 1.5}rem)` }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {depth > 0 && (
              <ChevronRight
                className="size-3.5 shrink-0 text-muted-foreground/50"
                aria-hidden
              />
            )}
            <span className="truncate text-sm font-medium text-foreground">
              {category.name}
            </span>
            <span className="font-mono text-xs text-skope-accent">
              {category.numberPrefix}
            </span>
            <StockModeBadge mode={category.stockMode} />
            {category.attributes.length > 0 && (
              <StatusPill tone="neutral" size="sm" dot={false}>
                {category.attributes.length} Merkmale
              </StatusPill>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {settings.defaultChannel
              ? CHANNEL_META[settings.defaultChannel].label
              : "kein Kanal"}
            {" · "}
            {PUBLISH_MODE_META[settings.publishMode].label}
            {settings.reorderLevel !== null &&
              ` · Meldebestand ${settings.reorderLevel}`}
            {settings.requiresInspection && " · Prüfpflicht"}
            {category.description && ` · ${category.description}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/inventory?bereich=${category.id}`}
            className="rounded-md px-2 text-xs tabular-nums text-muted-foreground transition-colors hover:text-skope-accent"
          >
            {count} Artikel
          </Link>
          <Button
            variant="ghost"
            className={cn("size-9 p-0", TOUCH_EXTEND)}
            aria-label="Unterbereich anlegen"
            onClick={() => onAddChild(category.id)}
          >
            <Layers className="size-4" />
          </Button>
          <Button
            variant="ghost"
            className={cn("size-9 p-0", TOUCH_EXTEND)}
            aria-label="Bereich bearbeiten"
            onClick={() => onEdit(category)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            className={cn("size-9 p-0 text-muted-foreground hover:text-state-error", TOUCH_EXTEND)}
            aria-label="Bereich löschen"
            onClick={() => onRemove(category)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </li>

      {children.map((child) => (
        <CategoryNode
          key={child.id}
          category={child}
          categories={categories}
          articleCount={articleCount}
          depth={depth + 1}
          onEdit={onEdit}
          onAddChild={onAddChild}
          onRemove={onRemove}
        />
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Anlegen und Bearbeiten                                              */
/* ------------------------------------------------------------------ */

function CategoryDialog({
  category,
  parentId,
  open,
  articleCount,
  onOpenChange,
}: {
  category: Category | null
  /** `undefined` = geschlossen, `null` = neue oberste Ebene. */
  parentId: string | null | undefined
  open: boolean
  articleCount: number
  onOpenChange: (open: boolean) => void
}) {
  const categories = useCategories()
  const [form, setForm] = useState(() => toForm(category, parentId ?? null))
  const [attributes, setAttributes] = useState<AttributeDefinition[]>(
    () => category?.attributes ?? []
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [prefixTouched, setPrefixTouched] = useState(false)

  const key = category?.id ?? `neu:${parentId ?? "root"}`
  const [lastKey, setLastKey] = useState(key)
  if (open && key !== lastKey) {
    setLastKey(key)
    setForm(toForm(category, parentId ?? null))
    setAttributes(category?.attributes ?? [])
    setPrefixTouched(false)
    setError(null)
  }

  const modeLocked = category !== null && !canChangeStockMode(articleCount)

  const parentOptions = [
    { value: "", label: "Oberste Ebene" },
    ...categories
      .filter((entry) => entry.id !== category?.id)
      .map((entry) => ({ value: entry.id, label: entry.name })),
  ]

  async function save() {
    const problem = validateCategory(categories, {
      id: category?.id,
      parentId: form.parentId || null,
      name: form.name,
      numberPrefix: form.numberPrefix,
      stockMode: form.stockMode,
    })
    if (problem) {
      setError(problem)
      return
    }

    setError(null)
    setSaving(true)

    const payload = {
      parentId: form.parentId || null,
      name: form.name.trim(),
      numberPrefix: form.numberPrefix.trim().toUpperCase(),
      stockMode: form.stockMode,
      description: form.description,
      attributes,
      reorderLevel:
        form.reorderLevel.trim() === ""
          ? null
          : Number.parseInt(form.reorderLevel, 10),
      defaultChannel: form.defaultChannel ? (form.defaultChannel as Channel) : null,
      publishMode: form.publishMode,
      requiresInspection: form.requiresInspection,
    }

    const result = category
      ? await runAction(repositories.categories.update(category.id, payload), {
          success: "Bereich gespeichert",
          failure: "Nicht gespeichert",
        })
      : await runAction(repositories.categories.create(payload), {
          success: "Bereich angelegt",
          failure: "Nicht angelegt",
        })

    setSaving(false)
    if (result) onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={category ? "Bereich bearbeiten" : "Bereich anlegen"}
      description="Was hier nicht gesetzt ist, erbt der Bereich von der Ebene darüber."
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
          <TextField
            label="Name"
            required
            error={error}
            value={form.name}
            onChange={(event) => {
              const name = event.target.value
              setForm((current) => ({
                ...current,
                name,
                numberPrefix:
                  prefixTouched || category
                    ? current.numberPrefix
                    : suggestPrefix(name),
              }))
            }}
          />
          <TextField
            label="Nummernpräfix"
            required
            mono
            hint="Beginnt jede Artikelnummer dieses Bereichs, z. B. ET-DISP."
            value={form.numberPrefix}
            onChange={(event) => {
              setPrefixTouched(true)
              setForm((current) => ({
                ...current,
                numberPrefix: event.target.value.toUpperCase(),
              }))
            }}
          />
          <SelectField
            label="Übergeordneter Bereich"
            value={form.parentId}
            onChange={(event) =>
              setForm((current) => ({ ...current, parentId: event.target.value }))
            }
            options={parentOptions}
          />
          <SelectField
            label="Bestandsart"
            disabled={modeLocked}
            hint={
              modeLocked
                ? `Festgeschrieben — im Bereich liegen bereits ${articleCount} Artikel.`
                : "Einzelstücke werden je Gerät geführt, Mengen als Zähler."
            }
            value={form.stockMode}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                stockMode: event.target.value as StockMode,
              }))
            }
            options={STOCK_MODES.map((mode) => ({
              value: mode,
              label: STOCK_MODE_META[mode].label,
            }))}
          />
        </div>

        <TextareaField
          label="Beschreibung"
          rows={2}
          placeholder="Wofür ist dieser Bereich gedacht?"
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({ ...current, description: event.target.value }))
          }
        />

        <div>
          <p className="type-label mb-2">Regeln</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Zielkanal"
              placeholder="Von oben erben"
              value={form.defaultChannel}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  defaultChannel: event.target.value,
                }))
              }
              options={CHANNELS.map((channel) => ({
                value: channel,
                label: CHANNEL_META[channel].label,
              }))}
            />
            <SelectField
              label="Automatikstufe"
              hint={PUBLISH_MODE_META[form.publishMode].description}
              value={form.publishMode}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  publishMode: event.target.value as PublishMode,
                }))
              }
              options={PUBLISH_MODES.map((mode) => ({
                value: mode,
                label: PUBLISH_MODE_META[mode].label,
              }))}
            />
            {form.stockMode === "MENGE" && (
              <TextField
                label="Meldebestand"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="keine Überwachung"
                hint="Warnschwelle für alle Artikel dieses Bereichs."
                value={form.reorderLevel}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    reorderLevel: event.target.value,
                  }))
                }
              />
            )}
          </div>
          {form.stockMode === "SERIALISIERT" && (
            <ToggleRow
              className="mt-4"
              label="Prüfprotokoll verpflichtend"
              description="Ohne abgeschlossene Prüfung wird kein Gerät verkaufsbereit."
              checked={form.requiresInspection}
              onCheckedChange={(value) =>
                setForm((current) => ({ ...current, requiresInspection: value }))
              }
            />
          )}
        </div>

        <AttributeEditor value={attributes} onChange={setAttributes} />
      </div>
    </Modal>
  )
}

function toForm(category: Category | null, parentId: string | null) {
  return {
    name: category?.name ?? "",
    numberPrefix: category?.numberPrefix ?? "",
    parentId: category?.parentId ?? parentId ?? "",
    stockMode: (category?.stockMode ?? "MENGE") as StockMode,
    description: category?.description ?? "",
    reorderLevel:
      category?.reorderLevel === null || category?.reorderLevel === undefined
        ? ""
        : String(category.reorderLevel),
    defaultChannel: category?.defaultChannel ?? "",
    publishMode: (category?.publishMode ?? "VORSCHLAG") as PublishMode,
    requiresInspection: category?.requiresInspection ?? false,
  }
}
