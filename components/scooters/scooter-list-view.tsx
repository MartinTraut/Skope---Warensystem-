"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Plus, SlidersHorizontal, X } from "lucide-react"

import { NewScooterDialog } from "./new-scooter-dialog"
import { ScooterTable } from "./scooter-table"
import { InlineSelect, SearchInput } from "@/components/skope/form"
import { Panel, PageHeader } from "@/components/skope/primitives"
import { TableSkeleton } from "@/components/skope/skeletons"
import { Button } from "@/components/ui/button"
import {
  useHydrated,
  useManufacturers,
  useScooters,
} from "@/hooks/use-cockpit"
import { expectedMarginCents } from "@/lib/domain/metrics"
import {
  SALE_STATUS_META,
  WORKFLOW_META,
  isInStock,
  isListed,
} from "@/lib/domain/status"
import {
  SALE_STATUSES,
  WORKFLOW_STATUSES,
  type SaleStatus,
  type Scooter,
  type WorkflowStatus,
} from "@/lib/domain/types"
import { FOCUS_RING } from "@/components/skope/focus"
import { cn } from "@/lib/utils"

type SortKey = "updated" | "number" | "price" | "margin"

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "updated", label: "Zuletzt geändert" },
  { value: "number", label: "Scooter-Nummer" },
  { value: "price", label: "Verkaufspreis" },
  { value: "margin", label: "Erwartete Marge" },
]

/**
 * Bestandsübersicht mit Suche, Filtern und Sortierung.
 *
 * Die Filter lesen ihre Startwerte aus der URL — dadurch können Dashboard und
 * Prozessübersicht direkt auf eine gefilterte Liste verlinken.
 */
export function ScooterListView() {
  const searchParams = useSearchParams()
  const hydrated = useHydrated()
  const scooters = useScooters()
  const manufacturers = useManufacturers()

  const [query, setQuery] = useState("")
  const [workflow, setWorkflow] = useState<string>(
    searchParams.get("workflow") ?? "alle"
  )
  const [saleStatus, setSaleStatus] = useState<string>(
    searchParams.get("sale") ?? "alle"
  )
  const [manufacturer, setManufacturer] = useState("alle")
  const [listed, setListed] = useState<string>(searchParams.get("listed") ?? "alle")
  const [scope, setScope] = useState<string>(searchParams.get("scope") ?? "bestand")
  const [sort, setSort] = useState<SortKey>("updated")
  const [filtersOpen, setFiltersOpen] = useState(false)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()

    const result = scooters.filter((scooter) => {
      if (scope === "bestand" && !isInStock(scooter)) return false
      if (scope === "verkauft" && scooter.saleStatus !== "VERKAUFT") return false

      if (workflow !== "alle" && scooter.workflowStatus !== workflow) return false
      if (saleStatus !== "alle" && scooter.saleStatus !== saleStatus) return false
      if (manufacturer !== "alle" && scooter.manufacturer !== manufacturer) {
        return false
      }
      if (listed === "ja" && !isListed(scooter)) return false
      if (listed === "nein" && isListed(scooter)) return false

      if (needle) {
        const haystack = [
          scooter.scooterNumber,
          scooter.serialNumber,
          scooter.manufacturer,
          scooter.model,
          scooter.variant,
          scooter.color,
          scooter.location,
        ]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(needle)) return false
      }

      return true
    })

    return sortScooters(result, sort)
  }, [scooters, query, workflow, saleStatus, manufacturer, listed, scope, sort])

  const activeFilters =
    (workflow !== "alle" ? 1 : 0) +
    (saleStatus !== "alle" ? 1 : 0) +
    (manufacturer !== "alle" ? 1 : 0) +
    (listed !== "alle" ? 1 : 0) +
    (scope !== "bestand" ? 1 : 0)

  const [createOpen, setCreateOpen] = useState(false)

  function resetFilters() {
    setWorkflow("alle")
    setSaleStatus("alle")
    setManufacturer("alle")
    setListed("alle")
    setScope("bestand")
    setQuery("")
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scooter"
        description="Vollständiger Bestand mit Prüf-, Aufbereitungs- und Kanalstatus."
        actions={
          <Button className="h-10 gap-2 px-4" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Scooter hinzufügen
          </Button>
        }
      />

      <Panel className="overflow-hidden">
        {/* Filterleiste */}
        <div className="border-b border-skope-line p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              placeholder="Nummer, Seriennummer, Modell oder Standort …"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 sm:max-w-sm"
              aria-label="Scooter suchen"
            />

            <button
              type="button"
              onClick={() => setFiltersOpen((value) => !value)}
              aria-expanded={filtersOpen}
              className={cn(
                "flex h-11 items-center gap-2 rounded-lg border px-3 type-body-sm transition-colors lg:hidden",
                FOCUS_RING,
                activeFilters > 0
                  ? "border-skope-gold/40 bg-skope-gold/8 text-skope-gold"
                  : "border-skope-line-strong text-muted-foreground hover:text-foreground"
              )}
            >
              <SlidersHorizontal className="size-4" />
              Filter
              {activeFilters > 0 && (
                <span className="grid size-4 place-items-center rounded-full bg-skope-gold text-[10px] font-medium text-[#14100a]">
                  {activeFilters}
                </span>
              )}
            </button>

            <div className="ml-auto hidden items-center gap-2 lg:flex">
              <FilterControls
                workflow={workflow}
                setWorkflow={setWorkflow}
                saleStatus={saleStatus}
                setSaleStatus={setSaleStatus}
                manufacturer={manufacturer}
                setManufacturer={setManufacturer}
                manufacturers={manufacturers}
                listed={listed}
                setListed={setListed}
                scope={scope}
                setScope={setScope}
                sort={sort}
                setSort={setSort}
              />
            </div>
          </div>

          {/* Auf schmalen Viewports die Filter aufklappen statt quetschen. */}
          {filtersOpen && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:hidden">
              <FilterControls
                workflow={workflow}
                setWorkflow={setWorkflow}
                saleStatus={saleStatus}
                setSaleStatus={setSaleStatus}
                manufacturer={manufacturer}
                setManufacturer={setManufacturer}
                manufacturers={manufacturers}
                listed={listed}
                setListed={setListed}
                scope={scope}
                setScope={setScope}
                sort={sort}
                setSort={setSort}
                stacked
              />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{filtered.length}</span>{" "}
              {filtered.length === 1 ? "Scooter" : "Scooter"}
              {activeFilters > 0 || query ? " gefiltert" : ""}
            </p>
            {(activeFilters > 0 || query) && (
              <button
                type="button"
                onClick={resetFilters}
                className={cn(
                  // Eigene Trefferfläche: als reiner Textlink war die
                  // Schaltfläche am Tablet kaum zu treffen.
                  "inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors",
                  "hover:text-foreground",
                  FOCUS_RING
                )}
              >
                <X className="size-3.5" />
                Filter zurücksetzen
              </button>
            )}
          </div>
        </div>

        {!hydrated ? (
          <TableSkeleton rows={8} />
        ) : (
          <ScooterTable
            scooters={filtered}
            emptyTitle={
              query || activeFilters > 0
                ? "Keine Treffer"
                : "Noch keine Scooter erfasst"
            }
            emptyDescription={
              query || activeFilters > 0
                ? "Für diese Kombination aus Suche und Filtern gibt es keine Ergebnisse."
                : "Lege den ersten Scooter an oder importiere eine Lieferantenliste."
            }
            emptyAction={
              query || activeFilters > 0 ? (
                <Button
                  variant="outline"
                  className="h-10 px-4"
                  onClick={resetFilters}
                >
                  Filter zurücksetzen
                </Button>
              ) : (
                <Button className="h-10 px-4" onClick={() => setCreateOpen(true)}>
                  Scooter hinzufügen
                </Button>
              )
            }
          />
        )}
      </Panel>

      <NewScooterDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Filter                                                              */
/* ------------------------------------------------------------------ */

interface FilterControlsProps {
  workflow: string
  setWorkflow: (value: string) => void
  saleStatus: string
  setSaleStatus: (value: string) => void
  manufacturer: string
  setManufacturer: (value: string) => void
  manufacturers: string[]
  listed: string
  setListed: (value: string) => void
  scope: string
  setScope: (value: string) => void
  sort: SortKey
  setSort: (value: SortKey) => void
  stacked?: boolean
}

function FilterControls({
  workflow,
  setWorkflow,
  saleStatus,
  setSaleStatus,
  manufacturer,
  setManufacturer,
  manufacturers,
  listed,
  setListed,
  scope,
  setScope,
  sort,
  setSort,
  stacked,
}: FilterControlsProps) {
  const width = stacked ? "w-full" : "w-[9.5rem]"

  return (
    <>
      <InlineSelect
        aria-label="Bestand"
        className={width}
        value={scope}
        onChange={(event) => setScope(event.target.value)}
        options={[
          { value: "bestand", label: "Aktiver Bestand" },
          { value: "verkauft", label: "Verkauft" },
          { value: "alle", label: "Alle Datensätze" },
        ]}
      />
      <InlineSelect
        aria-label="Workflow-Status"
        className={width}
        value={workflow}
        onChange={(event) => setWorkflow(event.target.value)}
        options={[
          { value: "alle", label: "Workflow: alle" },
          ...WORKFLOW_STATUSES.map((status: WorkflowStatus) => ({
            value: status,
            label: WORKFLOW_META[status].label,
          })),
        ]}
      />
      <InlineSelect
        aria-label="Verkaufsstatus"
        className={width}
        value={saleStatus}
        onChange={(event) => setSaleStatus(event.target.value)}
        options={[
          { value: "alle", label: "Verkauf: alle" },
          ...SALE_STATUSES.map((status: SaleStatus) => ({
            value: status,
            label: SALE_STATUS_META[status].label,
          })),
        ]}
      />
      <InlineSelect
        aria-label="Hersteller"
        className={width}
        value={manufacturer}
        onChange={(event) => setManufacturer(event.target.value)}
        options={[
          { value: "alle", label: "Hersteller: alle" },
          ...manufacturers.map((name) => ({ value: name, label: name })),
        ]}
      />
      <InlineSelect
        aria-label="Inseriert"
        className={width}
        value={listed}
        onChange={(event) => setListed(event.target.value)}
        options={[
          { value: "alle", label: "Kanäle: alle" },
          { value: "ja", label: "Inseriert" },
          { value: "nein", label: "Nicht inseriert" },
        ]}
      />
      <InlineSelect
        aria-label="Sortierung"
        className={width}
        value={sort}
        onChange={(event) => setSort(event.target.value as SortKey)}
        options={SORT_OPTIONS}
      />
    </>
  )
}

function sortScooters(scooters: Scooter[], sort: SortKey): Scooter[] {
  const sorted = [...scooters]

  switch (sort) {
    case "number":
      return sorted.sort((a, b) => a.scooterNumber.localeCompare(b.scooterNumber))
    case "price":
      return sorted.sort(
        (a, b) => (b.salePriceCents ?? 0) - (a.salePriceCents ?? 0)
      )
    case "margin":
      return sorted.sort(
        (a, b) => (expectedMarginCents(b) ?? 0) - (expectedMarginCents(a) ?? 0)
      )
    default:
      return sorted.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
  }
}
