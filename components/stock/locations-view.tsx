"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react"

import { ConfirmDialog } from "@/components/skope/confirm-dialog"
import { Modal } from "@/components/skope/modal"
import { TextField, TextareaField } from "@/components/skope/form"
import {
  EmptyState,
  Metric,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from "@/components/skope/primitives"
import { ListSkeleton, MetricGridSkeleton } from "@/components/skope/skeletons"
import { TOUCH_EXTEND } from "@/components/skope/focus"
import { Button } from "@/components/ui/button"
import {
  useArticles,
  useHydrated,
  useLocations,
  useStockLevels,
  useUnits,
} from "@/hooks/use-cockpit"
import { repositories } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import { formatCents, formatNumber } from "@/lib/domain/money"
import { isUnitInStock } from "@/lib/domain/stock"
import type { StorageLocation } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/**
 * Lagerplätze verwalten.
 *
 * Der Platz ist bewusst nicht Teil der Artikelnummer: Wandert eine Kiste ins
 * andere Regal, ist das eine Umlagerungsbuchung — und keine neue Nummer.
 */
export function LocationsView() {
  const hydrated = useHydrated()
  const locations = useLocations()
  const articles = useArticles()
  const units = useUnits()
  const levels = useStockLevels()

  const [editing, setEditing] = useState<StorageLocation | null>(null)
  const [creating, setCreating] = useState(false)
  const [removing, setRemoving] = useState<StorageLocation | null>(null)

  /** Was liegt wo — einmal berechnet statt je Karte erneut. */
  const occupancy = useMemo(() => {
    const map = new Map<
      string,
      { quantity: number; valueCents: number; units: number; articles: Set<string> }
    >()
    const bucket = (id: string) => {
      let entry = map.get(id)
      if (!entry) {
        entry = { quantity: 0, valueCents: 0, units: 0, articles: new Set() }
        map.set(id, entry)
      }
      return entry
    }

    for (const article of articles) {
      const level = levels.get(article.id)
      if (!level) continue
      for (const [locationId, quantity] of Object.entries(level.byLocation)) {
        if (quantity === 0) continue
        const entry = bucket(locationId || "")
        entry.quantity += quantity
        entry.valueCents += quantity * level.averageCostCents
        entry.articles.add(article.id)
      }
    }

    for (const unit of units) {
      if (!isUnitInStock(unit)) continue
      const entry = bucket(unit.locationId ?? "")
      entry.units += 1
      entry.valueCents += unit.purchasePriceCents + unit.additionalCostsCents
    }

    return map
  }, [articles, units, levels])

  const unassigned = occupancy.get("")
  const totalValue = [...occupancy.values()].reduce(
    (sum, entry) => sum + entry.valueCents,
    0
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lagerplätze"
        description="Regale, Fächer und Kisten. Der Platz hängt an der Buchung — Umlagern ändert keine Artikelnummer."
        actions={
          <Button className="h-10 gap-2 px-4" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Lagerplatz anlegen
          </Button>
        }
      />

      {!hydrated ? (
        <MetricGridSkeleton count={3} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Lagerplätze" value={formatNumber(locations.length)} />
          <Metric label="Lagerwert gesamt" value={formatCents(totalValue)} />
          <Metric
            label="Ohne Platz"
            value={formatNumber(
              (unassigned?.quantity ?? 0) + (unassigned?.units ?? 0)
            )}
            hint="Bestand ohne zugeordneten Platz"
            accent={(unassigned?.quantity ?? 0) + (unassigned?.units ?? 0) > 0}
          />
        </div>
      )}

      {!hydrated ? (
        <Panel>
          <ListSkeleton rows={5} />
        </Panel>
      ) : locations.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<MapPin className="size-5" />}
            title="Noch kein Lagerplatz"
            description="Lege die Plätze so an, wie sie im Lager beschriftet sind — A-01, Regal 3, Palette Süd."
            action={
              <Button className="h-10 px-4" onClick={() => setCreating(true)}>
                Ersten Lagerplatz anlegen
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {locations.map((location) => {
            const entry = occupancy.get(location.id)
            return (
              <Panel key={location.id}>
                <PanelHeader
                  title={
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-skope-accent">
                        {location.code}
                      </span>
                      <span className="truncate">{location.name}</span>
                    </span>
                  }
                  description={location.note || undefined}
                  action={
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        className={cn("size-9 p-0", TOUCH_EXTEND)}
                        aria-label="Lagerplatz bearbeiten"
                        onClick={() => setEditing(location)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        className={cn("size-9 p-0 text-muted-foreground hover:text-state-error", TOUCH_EXTEND)}
                        aria-label="Lagerplatz löschen"
                        onClick={() => setRemoving(location)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  }
                />
                <PanelBody className="space-y-1.5">
                  <Row
                    label="Teile"
                    value={`${formatNumber(entry?.quantity ?? 0)} Stück`}
                  />
                  <Row label="Geräte" value={formatNumber(entry?.units ?? 0)} />
                  <div className="my-2 h-px bg-skope-line" />
                  <Row
                    label="Lagerwert"
                    value={formatCents(entry?.valueCents ?? 0)}
                    strong
                  />
                  <Link
                    href={`/movements`}
                    className="mt-3 inline-block rounded text-xs text-muted-foreground transition-colors hover:text-skope-accent"
                  >
                    Buchungen ansehen
                  </Link>
                </PanelBody>
              </Panel>
            )
          })}
        </div>
      )}

      <LocationDialog
        location={editing}
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false)
            setEditing(null)
          }
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Lagerplatz löschen"
        description={
          removing
            ? `„${removing.code} – ${removing.name}" wird entfernt. Solange dort noch Bestand liegt, lehnt das System das Löschen ab.`
            : ""
        }
        onConfirm={async () => {
          if (!removing) return
          await runAction(repositories.locations.remove(removing.id), {
            success: "Lagerplatz gelöscht",
            failure: "Lagerplatz nicht gelöscht",
          })
          setRemoving(null)
        }}
      />
    </div>
  )
}

function Row({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          strong
            ? "font-medium tabular-nums text-foreground"
            : "tabular-nums text-foreground"
        }
      >
        {value}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Anlegen und Bearbeiten                                              */
/* ------------------------------------------------------------------ */

function LocationDialog({
  location,
  open,
  onOpenChange,
}: {
  location: StorageLocation | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const empty = { code: "", name: "", note: "" }
  const [form, setForm] = useState(() =>
    location ? { code: location.code, name: location.name, note: location.note } : empty
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [lastId, setLastId] = useState(location?.id ?? null)
  const currentId = location?.id ?? null
  if (open && currentId !== lastId) {
    setLastId(currentId)
    setForm(
      location
        ? { code: location.code, name: location.name, note: location.note }
        : empty
    )
    setError(null)
  }

  async function save() {
    if (!form.code.trim()) {
      setError("Ohne Kurzcode lässt sich der Platz im Lager nicht wiederfinden.")
      return
    }
    setError(null)
    setSaving(true)

    const result = location
      ? await runAction(
          repositories.locations.update(location.id, {
            code: form.code.trim(),
            name: form.name.trim(),
            note: form.note,
          }),
          { success: "Lagerplatz gespeichert", failure: "Nicht gespeichert" }
        )
      : await runAction(
          repositories.locations.create({
            code: form.code.trim(),
            name: form.name.trim(),
            note: form.note,
          }),
          { success: "Lagerplatz angelegt", failure: "Nicht angelegt" }
        )

    setSaving(false)
    if (result) onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={location ? "Lagerplatz bearbeiten" : "Lagerplatz anlegen"}
      description="Der Kurzcode ist das, was am Regal steht."
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
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Kurzcode"
            required
            mono
            placeholder="A-03"
            error={error}
            value={form.code}
            onChange={(event) =>
              setForm((current) => ({ ...current, code: event.target.value }))
            }
          />
          <TextField
            label="Bezeichnung"
            placeholder="Regal Ersatzteile"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
        <TextareaField
          label="Notiz"
          rows={2}
          value={form.note}
          onChange={(event) =>
            setForm((current) => ({ ...current, note: event.target.value }))
          }
        />
      </div>
    </Modal>
  )
}
