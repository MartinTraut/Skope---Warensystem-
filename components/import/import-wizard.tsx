"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  FileUp,
  FolderTree,
  Sparkles,
} from "lucide-react"

import { InlineSelect } from "@/components/skope/form"
import { CategorySelect } from "@/components/inventory/category-select"
import {
  DemoTag,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from "@/components/skope/primitives"
import { StatusPill } from "@/components/skope/status-pill"
import { ConfirmDialog } from "@/components/skope/confirm-dialog"
import { Button } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import type { ImportRow } from "@/lib/data/repository"
import { runAction } from "@/lib/data/run-action"
import {
  useArticles,
  useCategorySettings,
  useSavedMapping,
  useUnits,
} from "@/hooks/use-cockpit"
import { parseFile, suggestMapping } from "@/lib/integrations/csv"
import type { ParsedTable } from "@/lib/integrations/types"
import { formatCents, parseCents } from "@/lib/domain/money"
import { normalizeReference } from "@/lib/domain/numbering"
import { STOCK_MODE_META } from "@/lib/domain/status"
import {
  IMPORT_TARGET_FIELDS,
  type Article,
  type ArticleUnit,
  type Condition,
  type ResolvedCategorySettings,
  type StockMode,
} from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/* Zielfelder                                                          */
/* ------------------------------------------------------------------ */

const FIELD_LABELS: Record<string, string> = {
  name: "Bezeichnung",
  manufacturer: "Hersteller",
  mpn: "Teilenummer (MPN)",
  ean: "EAN",
  serialNumber: "Seriennummer",
  variant: "Variante",
  color: "Farbe",
  quantity: "Menge",
  purchasePriceCents: "Einkaufspreis",
  salePriceCents: "Verkaufspreis",
  mileageKm: "Kilometerstand",
  condition: "Zustand",
  purchaseDate: "Einkaufsdatum",
  location: "Lagerplatz",
  notes: "Bemerkung",
}

/**
 * Welche Felder je Bestandsart überhaupt sinnvoll sind.
 *
 * Eine Kiste Bremsbeläge hat keine Laufleistung, ein Scooter keine
 * Stückzahl. Felder anzubieten, die für den gewählten Bereich bedeutungslos
 * sind, erzeugt nur Zuordnungen, die später niemand mehr erklären kann.
 */
const FIELDS_BY_MODE: Record<StockMode, string[]> = {
  SERIALISIERT: [
    "name",
    "manufacturer",
    "serialNumber",
    "variant",
    "color",
    "mileageKm",
    "purchasePriceCents",
    "salePriceCents",
    "condition",
    "purchaseDate",
    "location",
    "notes",
  ],
  MENGE: [
    "name",
    "manufacturer",
    "mpn",
    "ean",
    "quantity",
    "purchasePriceCents",
    "salePriceCents",
    "condition",
    "purchaseDate",
    "location",
    "notes",
  ],
}

const REQUIRED_BY_MODE: Record<StockMode, string[]> = {
  SERIALISIERT: ["name", "serialNumber"],
  MENGE: ["name"],
}

const STEPS = [
  { key: "category", label: "Bereich" },
  { key: "file", label: "Datei" },
  { key: "mapping", label: "Zuordnung" },
  { key: "preview", label: "Vorschau" },
  { key: "validate", label: "Validierung" },
  { key: "done", label: "Import" },
] as const

type StepKey = (typeof STEPS)[number]["key"]

/* ------------------------------------------------------------------ */
/* Wizard                                                              */
/* ------------------------------------------------------------------ */

/**
 * Import-Assistent für Lieferanten- und Einkaufslisten.
 *
 * Bewusst formatoffen: Es sind keine Spaltennamen fest verdrahtet. Der Nutzer
 * wählt zuerst den Bereich — daraus ergeben sich Nummernkreis, Bestandsart und
 * die eigenen Merkmalsfelder, auf die sich Spalten ebenfalls zuordnen lassen.
 * Die bestätigte Zuordnung wird je Bereich gespeichert, damit der nächste
 * Import derselben Liste ohne Nacharbeit läuft.
 */
export function ImportWizard() {
  const router = useRouter()
  const articles = useArticles()
  const units = useUnits()

  const [step, setStep] = useState<StepKey>("category")
  const [categoryId, setCategoryId] = useState("")
  const [table, setTable] = useState<ParsedTable | null>(null)
  const [source, setSource] = useState<"DEMO" | "DATEI">("DATEI")
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [result, setResult] = useState<{
    imported: number
    skipped: number
    total: number
  } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const settings = useCategorySettings(categoryId || null)
  const savedMapping = useSavedMapping(categoryId || null)

  /** Feste Felder der Bestandsart plus die Merkmale des Bereichs. */
  const targets = useMemo(() => {
    const base = FIELDS_BY_MODE[settings.stockMode].filter((field) =>
      (IMPORT_TARGET_FIELDS as readonly string[]).includes(field)
    )
    return [
      ...base,
      ...settings.attributes.map((attribute) => `attr:${attribute.key}`),
    ]
  }, [settings])

  const labels = useMemo(() => {
    const map: Record<string, string> = { ...FIELD_LABELS }
    for (const attribute of settings.attributes) {
      map[`attr:${attribute.key}`] = attribute.unit
        ? `${attribute.label} (${attribute.unit})`
        : attribute.label
    }
    return map
  }, [settings])

  const requiredFields = REQUIRED_BY_MODE[settings.stockMode]

  /* ----- Datei laden ----- */

  function applyTable(next: ParsedTable, nextSource: "DEMO" | "DATEI") {
    setTable(next)
    setSource(nextSource)

    // Gespeichertes Mapping wiederverwenden, sofern die Spalten passen.
    const restored: Record<string, string> = {}
    let restoredCount = 0
    if (savedMapping) {
      for (const entry of savedMapping.columns) {
        if (entry.source && next.headers.includes(entry.source)) {
          restored[entry.target] = entry.source
          restoredCount += 1
        }
      }
    }

    setMapping(
      restoredCount >= 3 ? restored : suggestMapping(next.headers, targets, labels)
    )
    setStep("mapping")

    if (restoredCount >= 3) {
      toast.info("Gespeicherte Zuordnung übernommen", {
        description: "Bitte trotzdem kurz prüfen.",
      })
    }
  }

  async function loadDemo() {
    setLoading(true)
    try {
      const demo = await runAction(repositories.imports.loadDemoTable(), {
        failure: "Beispieldatei konnte nicht geladen werden",
      })
      if (demo) applyTable(demo, "DEMO")
    } finally {
      setLoading(false)
    }
  }

  async function loadFile(file: File) {
    setLoading(true)
    try {
      const parsed = await parseFile(file)
      applyTable(parsed, "DATEI")
      toast.success(`${parsed.rows.length} Zeilen gelesen`)
    } catch (error) {
      toast.error("Datei konnte nicht gelesen werden", {
        description:
          error instanceof Error ? error.message : "Unbekannter Fehler.",
      })
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  /* ----- Auswertung ----- */

  const rows = useMemo(
    () =>
      table
        ? buildRows(table, mapping, settings, { articles, units })
        : [],
    [table, mapping, settings, articles, units]
  )

  const valid = rows.filter((row) => row.issues.length === 0)
  const problematic = rows.filter((row) => row.issues.length > 0)
  const missingRequired = requiredFields.filter((field) => !mapping[field])

  /* ----- Import ----- */

  async function runImport() {
    if (!table || !categoryId) return

    setImporting(true)
    const response = await repositories.imports.importRows({
      fileName: table.fileName,
      source,
      categoryId,
      rows: valid.map((row) => row.input),
    })
    setImporting(false)

    if (!response.ok) {
      toast.error("Import fehlgeschlagen", { description: response.message })
      return
    }

    void repositories.imports.saveMapping(
      categoryId,
      targets.map((target) => ({ target, source: mapping[target] ?? "" }))
    )

    setResult({
      imported: response.data.rowsImported,
      skipped: rows.length - response.data.rowsImported,
      total: rows.length,
    })
    setStep("done")

    toast.success(`${response.data.rowsImported} Zeilen importiert`, {
      description:
        response.data.rowsSkipped > 0
          ? `${response.data.rowsSkipped} Zeilen wurden übersprungen.`
          : "Alle Zeilen wurden übernommen.",
    })
  }

  function restart() {
    setTable(null)
    setMapping({})
    setResult(null)
    setStep("file")
  }

  const serialized = settings.stockMode === "SERIALISIERT"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import"
        description="Einkaufs- und Lieferantenlisten einlesen, Spalten zuordnen und als Bestand übernehmen — Geräte einzeln, Teile als Menge."
        actions={<DemoTag>Demo-Daten verfügbar</DemoTag>}
      />

      <StepIndicator current={step} />

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Andere Datei wählen?"
        description="Die geladene Datei und die bestätigte Spaltenzuordnung werden verworfen. Bereits importierter Bestand bleibt erhalten."
        confirmLabel="Verwerfen"
        onConfirm={() => {
          restart()
          setDiscardOpen(false)
        }}
      />

      {step === "category" && (
        <CategoryStep
          categoryId={categoryId}
          settings={settings}
          onChange={setCategoryId}
          onNext={() => setStep("file")}
        />
      )}

      {step === "file" && (
        <FileStep
          loading={loading}
          inputRef={inputRef}
          settings={settings}
          onPickFile={loadFile}
          onLoadDemo={loadDemo}
          onBack={() => setStep("category")}
        />
      )}

      {step === "mapping" && table && (
        <MappingStep
          table={table}
          targets={targets}
          labels={labels}
          requiredFields={requiredFields}
          mapping={mapping}
          onChange={setMapping}
          missingRequired={missingRequired}
          onBack={() => setDiscardOpen(true)}
          onNext={() => setStep("preview")}
        />
      )}

      {step === "preview" && table && (
        <PreviewStep
          table={table}
          rows={rows}
          serialized={serialized}
          onBack={() => setStep("mapping")}
          onNext={() => setStep("validate")}
        />
      )}

      {step === "validate" && table && (
        <ValidationStep
          valid={valid}
          problematic={problematic}
          settings={settings}
          importing={importing}
          onBack={() => setStep("preview")}
          onImport={runImport}
        />
      )}

      {step === "done" && result && (
        <DoneStep
          result={result}
          serialized={serialized}
          onRestart={restart}
          onOpenTarget={() =>
            router.push(serialized ? "/inbound" : "/inventory")
          }
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Schritte                                                            */
/* ------------------------------------------------------------------ */

function StepIndicator({ current }: { current: StepKey }) {
  const currentIndex = STEPS.findIndex((step) => step.key === current)

  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1">
      {STEPS.map((step, index) => {
        const done = index < currentIndex
        const active = index === currentIndex
        return (
          <li
            key={step.key}
            className="flex shrink-0 items-center gap-1"
            aria-current={active ? "step" : undefined}
          >
            <div
              className={cn(
                "flex h-9 items-center gap-2 rounded-lg border px-3 type-body-sm transition-colors",
                active
                  ? "border-skope-accent/40 bg-skope-accent/10 font-medium text-skope-accent"
                  : done
                    ? "border-skope-line bg-surface-sunken text-foreground/70"
                    : "border-skope-line text-muted-foreground/60"
              )}
            >
              <span
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-full text-[11px] font-medium",
                  active
                    ? "bg-skope-accent text-[#14100a]"
                    : done
                      ? "bg-state-ready/20 text-state-ready"
                      : "bg-surface-track text-muted-foreground"
                )}
              >
                {done ? <Check className="size-2.5" strokeWidth={3} /> : index + 1}
              </span>
              {step.label}
            </div>
            {index < STEPS.length - 1 && (
              <ArrowRight
                className="size-3.5 shrink-0 text-skope-line-strong"
                aria-hidden
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function CategoryStep({
  categoryId,
  settings,
  onChange,
  onNext,
}: {
  categoryId: string
  settings: ResolvedCategorySettings
  onChange: (id: string) => void
  onNext: () => void
}) {
  return (
    <Panel>
      <PanelHeader
        title="Wohin wird importiert?"
        description="Der Bereich bestimmt Nummernkreis, Bestandsart und die Merkmalsfelder, auf die sich Spalten zuordnen lassen."
        icon={<FolderTree className="size-4" />}
      />
      <PanelBody className="space-y-4">
        <CategorySelect
          label="Bereich"
          value={categoryId}
          onChange={onChange}
          required
        />

        {categoryId && (
          <div className="rounded-lg border border-skope-line bg-surface-sunken p-3.5">
            <p className="text-sm text-foreground">{settings.pathLabel}</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>
                Bestandsart:{" "}
                <span className="text-foreground">
                  {STOCK_MODE_META[settings.stockMode].label}
                </span>{" "}
                — {STOCK_MODE_META[settings.stockMode].hint}
              </li>
              <li>
                Nummernkreis:{" "}
                <span className="font-mono text-foreground">
                  {settings.numberPrefix}
                </span>
              </li>
              <li>
                Merkmalsfelder:{" "}
                <span className="text-foreground">
                  {settings.attributes.length === 0
                    ? "keine"
                    : settings.attributes
                        .map((attribute) => attribute.label)
                        .join(", ")}
                </span>
              </li>
            </ul>
          </div>
        )}
      </PanelBody>
      <div className="flex justify-end border-t border-skope-line px-4 py-4 sm:px-5">
        <Button
          className="h-10 gap-2 px-4"
          disabled={!categoryId}
          onClick={onNext}
        >
          Weiter zur Datei
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </Panel>
  )
}

function FileStep({
  loading,
  inputRef,
  settings,
  onPickFile,
  onLoadDemo,
  onBack,
}: {
  loading: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  settings: ResolvedCategorySettings
  onPickFile: (file: File) => void
  onLoadDemo: () => void
  onBack: () => void
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <Panel>
        <PanelHeader
          title="Datei auswählen"
          description={`CSV oder TSV mit einer Kopfzeile. Ziel: ${settings.pathLabel || "kein Bereich"}. Die Datei wird ausschließlich im Browser verarbeitet.`}
        />
        <PanelBody>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onPickFile(file)
            }}
          />
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragOver(false)
              const file = event.dataTransfer.files?.[0]
              if (file) onPickFile(file)
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                inputRef.current?.click()
              }
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-colors duration-200",
              dragOver
                ? "border-skope-accent/60 bg-skope-accent/8"
                : "border-skope-line-strong hover:border-skope-accent/35 hover:bg-surface-sunken",
              "focus-visible:border-skope-accent/60 focus-visible:ring-3 focus-visible:ring-skope-accent/15 focus-visible:outline-none"
            )}
          >
            <FileUp
              className={cn(
                "size-7 transition-colors",
                dragOver ? "text-skope-accent" : "text-muted-foreground"
              )}
            />
            <p className="mt-4 text-sm font-medium text-foreground">
              {loading
                ? "Datei wird gelesen …"
                : "Datei hierher ziehen oder auswählen"}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Trennzeichen (Semikolon, Komma, Tab) wird automatisch erkannt.
            </p>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground/80">XLSX</strong> wird im
            Prototyp noch nicht gelesen — bitte vorerst als CSV exportieren.
          </p>
        </PanelBody>
        <div className="flex justify-start border-t border-skope-line px-4 py-4 sm:px-5">
          <Button variant="outline" className="h-10 gap-2 px-4" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Bereich ändern
          </Button>
        </div>
      </Panel>

      <Panel accent>
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-skope-accent" />
              Demo-Datei
            </span>
          }
        />
        <PanelBody>
          <p className="text-sm leading-relaxed text-foreground/85">
            Eine erfundene Lieferliste — inklusive einer Dublette und einer
            Zeile ohne Bezeichnung, damit die Fehlerbehandlung sichtbar wird.
          </p>
          <Button
            className="mt-4 h-10 w-full px-4"
            onClick={onLoadDemo}
            disabled={loading}
          >
            {loading ? "Wird geladen …" : "Demo-Datei verwenden"}
          </Button>
          <p className="mt-3 type-caption leading-relaxed text-muted-foreground">
            Die Spaltennamen der Demo-Datei sind ein Beispiel und nirgends im
            Code fest verdrahtet.
          </p>
        </PanelBody>
      </Panel>
    </div>
  )
}

/**
 * Quellspalten, die mehr als ein Zielfeld füllen.
 *
 * Unbemerkt wäre das teuer: „EK netto" auf Einkauf *und* Verkauf ergibt für
 * jede Zeile eine Marge von null — und niemand sucht den Fehler später im
 * Import.
 */
function findDuplicateColumns(
  targets: string[],
  mapping: Record<string, string>
): [string, string[]][] {
  const byColumn = targets
    .filter((target) => mapping[target])
    .reduce<Record<string, string[]>>((acc, target) => {
      const column = mapping[target]
      acc[column] = [...(acc[column] ?? []), target]
      return acc
    }, {})

  return Object.entries(byColumn).filter(([, fields]) => fields.length > 1)
}

function MappingStep({
  table,
  targets,
  labels,
  requiredFields,
  mapping,
  onChange,
  missingRequired,
  onBack,
  onNext,
}: {
  table: ParsedTable
  targets: string[]
  labels: Record<string, string>
  requiredFields: string[]
  mapping: Record<string, string>
  onChange: (mapping: Record<string, string>) => void
  missingRequired: string[]
  onBack: () => void
  onNext: () => void
}) {
  const [manualEdit, setManualEdit] = useState(false)

  const options = [
    { value: "", label: "— nicht zuordnen —" },
    ...table.headers.map((header) => ({ value: header, label: header })),
  ]

  const sampleOf = (target: string) =>
    mapping[target]
      ? (table.rows.find((row) => row[mapping[target]])?.[mapping[target]] ?? "")
      : ""

  const mapped = targets.filter((target) => mapping[target])
  const unresolved = targets.filter(
    (target) => !mapping[target] && !requiredFields.includes(target)
  )
  const duplicates = findDuplicateColumns(targets, mapping)

  const usedColumns = new Set(mapped.map((target) => mapping[target]))
  const ignoredColumns = table.headers.filter(
    (header) => !usedColumns.has(header)
  )

  const blocked = missingRequired.length > 0 || duplicates.length > 0
  const editing = manualEdit || blocked

  return (
    <Panel>
      <PanelHeader
        title="Spalten zuordnen"
        description={`${table.fileName} · ${table.headers.length} Spalten, ${table.rows.length} Zeilen`}
        action={
          !blocked ? (
            <Button
              variant="outline"
              className="h-9 px-3.5"
              onClick={() => setManualEdit(!manualEdit)}
            >
              {manualEdit ? "Fertig" : "Zuordnung ändern"}
            </Button>
          ) : null
        }
      />
      <PanelBody className="space-y-4">
        {missingRequired.length > 0 ? (
          <div className="flex gap-2.5 rounded-lg border border-state-warn/30 bg-state-warn/8 p-3.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-state-warn" />
            <p className="text-xs leading-relaxed text-foreground/85">
              Pflichtfelder ohne Zuordnung:{" "}
              <strong>
                {missingRequired.map((field) => labels[field] ?? field).join(", ")}
              </strong>
              . Ohne sie kann kein Datensatz angelegt werden — bitte unten die
              passende Spalte auswählen.
            </p>
          </div>
        ) : (
          <div className="flex gap-2.5 rounded-lg border border-state-ready/28 bg-state-ready/8 p-3.5">
            <Check className="mt-0.5 size-4 shrink-0 text-state-ready" />
            <p className="text-xs leading-relaxed text-foreground/85">
              <strong>
                {mapped.length} von {targets.length} Feldern automatisch erkannt
              </strong>{" "}
              — anhand der Spaltennamen der Datei. Prüfe die Beispielwerte; sie
              stammen aus der ersten gefüllten Zeile.
            </p>
          </div>
        )}

        {duplicates.length > 0 && (
          <div className="flex gap-2.5 rounded-lg border border-state-error/30 bg-state-error/8 p-3.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-state-error" />
            <div className="min-w-0 text-xs leading-relaxed text-foreground/85">
              <p className="font-medium text-state-error">
                Eine Spalte ist mehrfach vergeben
              </p>
              <ul className="mt-1 space-y-0.5">
                {duplicates.map(([column, fields]) => (
                  <li key={column}>
                    <strong>{column}</strong> füllt{" "}
                    {fields.map((field) => labels[field] ?? field).join(" und ")}{" "}
                    — beide Felder bekommen denselben Wert.
                  </li>
                ))}
              </ul>
              <p className="mt-1.5">
                Der Import ist gesperrt, bis die Zuordnung eindeutig ist.
              </p>
            </div>
          </div>
        )}

        {editing ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {targets.map((target) => {
              const required = requiredFields.includes(target)
              const sample = sampleOf(target)
              const missing = required && !mapping[target]

              return (
                <div key={target} className="min-w-0">
                  <label className="mb-1.5 flex items-center gap-1 type-body-sm font-medium text-foreground/90">
                    {labels[target] ?? target}
                    {required && <span className="text-skope-accent">*</span>}
                    {target.startsWith("attr:") && (
                      <span className="ml-1 type-caption text-muted-foreground">
                        Merkmal
                      </span>
                    )}
                  </label>
                  <InlineSelect
                    aria-label={`Quellspalte für ${labels[target] ?? target}`}
                    className={cn("h-11", missing && "border-state-warn/50")}
                    value={mapping[target] ?? ""}
                    onChange={(event) =>
                      onChange({ ...mapping, [target]: event.target.value })
                    }
                    options={options}
                  />
                  <p className="mt-1.5 h-4 truncate text-xs text-muted-foreground">
                    {sample ? `Beispiel: ${sample}` : ""}
                  </p>
                </div>
              )
            })}
          </div>
        ) : (
          <>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {mapped.map((target) => (
                <li
                  key={target}
                  className="min-w-0 rounded-lg border border-skope-line bg-surface-sunken px-3.5 py-2.5"
                >
                  <p className="flex items-center gap-1.5 type-label">
                    {labels[target] ?? target}
                    {requiredFields.includes(target) && (
                      <span className="text-skope-accent">*</span>
                    )}
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-foreground">
                    {mapping[target]}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {sampleOf(target) || "keine Beispieldaten"}
                  </p>
                </li>
              ))}
            </ul>

            {unresolved.length > 0 && (
              <p className="type-caption leading-relaxed text-muted-foreground">
                Ohne Zuordnung:{" "}
                {unresolved.map((field) => labels[field] ?? field).join(", ")}.
                Die Felder bleiben leer — über {"„"}Zuordnung ändern{"“"} lassen
                sie sich nachtragen.
              </p>
            )}

            {ignoredColumns.length > 0 && (
              <p className="type-caption leading-relaxed text-muted-foreground">
                {ignoredColumns.length === 1
                  ? "Eine Spalte der Datei wird nicht übernommen: "
                  : `${ignoredColumns.length} Spalten der Datei werden nicht übernommen: `}
                {ignoredColumns.join(", ")}.
              </p>
            )}
          </>
        )}
      </PanelBody>

      <WizardFooter
        onBack={onBack}
        backLabel="Andere Datei"
        onNext={onNext}
        nextLabel="Vorschau"
        nextDisabled={blocked}
      />
    </Panel>
  )
}

function PreviewStep({
  table,
  rows,
  serialized,
  onBack,
  onNext,
}: {
  table: ParsedTable
  rows: BuiltRow[]
  serialized: boolean
  onBack: () => void
  onNext: () => void
}) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Vorschau"
        description={`So werden die Daten übernommen — ${rows.length} Zeilen aus ${table.fileName}.`}
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead>
            <tr className="border-b border-skope-line">
              <Th className="pl-5">#</Th>
              <Th>Bezeichnung</Th>
              <Th>Hersteller</Th>
              <Th>{serialized ? "Seriennummer" : "Teilenummer"}</Th>
              <Th align="right">{serialized ? "km" : "Menge"}</Th>
              <Th align="right">EK</Th>
              <Th align="right">VK</Th>
              <Th className="pr-5">Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-skope-line">
            {rows.slice(0, 25).map((row) => (
              <tr
                key={row.index}
                className={cn(
                  "transition-colors hover:bg-surface-sunken",
                  row.issues.length > 0 && "bg-state-error/4"
                )}
              >
                <td className="py-2.5 pr-3 pl-5 text-xs text-muted-foreground tabular-nums">
                  {row.index}
                </td>
                <td className="px-3 py-2.5 text-foreground/85">
                  {row.input.name || "—"}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {row.input.manufacturer || "—"}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-foreground">
                  {(serialized ? row.input.serialNumber : row.input.mpn) || "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {serialized ? (row.input.mileageKm ?? 0) : (row.input.quantity ?? 1)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatCents(row.input.purchasePriceCents ?? 0)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatCents(row.input.salePriceCents ?? null)}
                </td>
                <td className="py-2.5 pr-5 pl-3">
                  {row.issues.length === 0 ? (
                    <StatusPill tone="ready" size="sm">
                      Bereit
                    </StatusPill>
                  ) : (
                    <StatusPill
                      tone={row.issues[0].severity === "error" ? "error" : "warn"}
                      size="sm"
                    >
                      {row.issues[0].severity === "error"
                        ? "Fehler"
                        : "Übersprungen"}
                    </StatusPill>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 25 && (
        <p className="border-t border-skope-line px-5 py-3 text-xs text-muted-foreground">
          Es werden die ersten 25 von {rows.length} Zeilen gezeigt. Importiert
          werden alle gültigen Zeilen.
        </p>
      )}

      <WizardFooter
        onBack={onBack}
        backLabel="Zurück zur Zuordnung"
        onNext={onNext}
        nextLabel="Validierung"
      />
    </Panel>
  )
}

function ValidationStep({
  valid,
  problematic,
  settings,
  importing,
  onBack,
  onImport,
}: {
  valid: BuiltRow[]
  problematic: BuiltRow[]
  settings: ResolvedCategorySettings
  importing: boolean
  onBack: () => void
  onImport: () => void
}) {
  const serialized = settings.stockMode === "SERIALISIERT"
  const pieces = valid.reduce((sum, row) => sum + (row.input.quantity ?? 1), 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Werden importiert" value={valid.length} tone="ready" />
        <SummaryTile
          label="Werden übersprungen"
          value={problematic.length}
          tone={problematic.length > 0 ? "warn" : "neutral"}
        />
        <SummaryTile
          label="Zeilen gesamt"
          value={valid.length + problematic.length}
          tone="neutral"
        />
      </div>

      {problematic.length > 0 && (
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Diese Zeilen werden nicht importiert"
            description="Jede übersprungene Zeile wird mit Grund im Import-Protokoll gespeichert — nichts wird still ignoriert."
          />
          <ul className="divide-y divide-skope-line">
            {problematic.map((row) => (
              <li
                key={row.index}
                className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    Zeile {row.index}
                    {row.input.serialNumber && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {row.input.serialNumber}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.issues.map((issue) => issue.reason).join(" · ")}
                  </p>
                </div>
                <StatusPill
                  tone={row.issues[0].severity === "error" ? "error" : "warn"}
                  size="sm"
                >
                  {row.issues[0].severity === "error" ? "Fehler" : "Dublette"}
                </StatusPill>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel>
        <PanelBody>
          <p className="text-sm leading-relaxed text-foreground/85">
            Importiert wird nach{" "}
            <strong className="text-foreground">{settings.pathLabel}</strong>.{" "}
            {serialized ? (
              <>
                Es entstehen{" "}
                <strong className="text-foreground">
                  {valid.length} Geräte
                </strong>{" "}
                im Wareneingang, jedes mit eigener Nummer und leerem
                Prüfprotokoll.
              </>
            ) : (
              <>
                Es werden{" "}
                <strong className="text-foreground">{pieces} Stück</strong> auf{" "}
                {valid.length} Artikel gebucht. Ist ein Artikel über Teilenummer
                oder Bezeichnung schon bekannt, entsteht ein Zugang auf den
                vorhandenen Satz statt eines zweiten.
              </>
            )}{" "}
            Bestehende Datensätze werden dabei <strong>nie</strong>{" "}
            überschrieben.
          </p>
        </PanelBody>
        <WizardFooter
          onBack={onBack}
          backLabel="Zurück zur Vorschau"
          onNext={onImport}
          nextLabel={
            importing ? "Import läuft …" : `${valid.length} Zeilen importieren`
          }
          nextDisabled={importing || valid.length === 0}
        />
      </Panel>
    </div>
  )
}

function DoneStep({
  result,
  serialized,
  onRestart,
  onOpenTarget,
}: {
  result: { imported: number; skipped: number; total: number }
  serialized: boolean
  onRestart: () => void
  onOpenTarget: () => void
}) {
  return (
    <Panel accent>
      <PanelBody>
        <EmptyState
          icon={<Check className="size-5 text-state-ready" />}
          title={`${result.imported} Zeilen importiert`}
          description={
            result.skipped > 0
              ? `${result.skipped} von ${result.total} Zeilen wurden übersprungen. Die Gründe stehen im Import-Protokoll.`
              : `Alle ${result.total} Zeilen wurden übernommen.`
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button className="h-10 px-4" onClick={onOpenTarget}>
                {serialized ? "Zum Wareneingang" : "Zum Bestand"}
              </Button>
              <Button variant="outline" className="h-10 px-4" onClick={onRestart}>
                Weitere Datei importieren
              </Button>
            </div>
          }
        />
      </PanelBody>
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* Bausteine                                                           */
/* ------------------------------------------------------------------ */

function WizardFooter({
  onBack,
  backLabel,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  onBack: () => void
  backLabel: string
  onNext: () => void
  nextLabel: string
  nextDisabled?: boolean
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-skope-line px-4 py-4 sm:flex-row sm:justify-between sm:px-5">
      <Button variant="outline" className="h-10 gap-2 px-4" onClick={onBack}>
        <ArrowLeft className="size-4" />
        {backLabel}
      </Button>
      <Button className="h-10 gap-2 px-4" onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
        <ArrowRight className="size-4" />
      </Button>
    </div>
  )
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "ready" | "warn" | "neutral"
}) {
  return (
    <Panel className="p-4 sm:p-5">
      <p className="type-label">{label}</p>
      <p
        className={cn(
          "type-metric mt-3",
          tone === "ready"
            ? "text-state-ready"
            : tone === "warn"
              ? "text-state-warn"
              : "text-foreground"
        )}
      >
        {value}
      </p>
    </Panel>
  )
}

function Th({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode
  align?: "left" | "right"
  className?: string
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2.5 text-[11px] font-medium tracking-[0.1em] text-muted-foreground/80 uppercase",
        align === "right" && "text-right",
        className
      )}
    >
      {children}
    </th>
  )
}

/* ------------------------------------------------------------------ */
/* Zeilenaufbereitung                                                  */
/* ------------------------------------------------------------------ */

interface BuiltRow {
  index: number
  input: ImportRow
  issues: { reason: string; severity: "warning" | "error" }[]
}

/**
 * Übersetzt die Rohzeilen anhand der Zuordnung in SKOPE-Datensätze und prüft
 * sie.
 *
 * Was als Dublette gilt, hängt an der Bestandsart: Bei Einzelstücken ist es
 * die Seriennummer — ein zweites Gerät mit derselben Nummer gibt es nicht. Bei
 * Mengen ist eine bekannte Teilenummer *keine* Dublette, sondern der Normalfall:
 * Der Zugang wird auf den vorhandenen Artikel gebucht.
 */
function buildRows(
  table: ParsedTable,
  mapping: Record<string, string>,
  settings: ResolvedCategorySettings,
  existing: { articles: Article[]; units: ArticleUnit[] }
): BuiltRow[] {
  const serialized = settings.stockMode === "SERIALISIERT"
  const seenInFile = new Set<string>()

  const unitBySerial = new Map(
    existing.units
      .filter((unit) => unit.serialNumber)
      .map((unit) => [normalizeReference(unit.serialNumber), unit])
  )
  const articleByMpn = new Map(
    existing.articles
      .filter((article) => article.mpn)
      .map((article) => [normalizeReference(article.mpn), article])
  )

  return table.rows.map((raw, index) => {
    const get = (target: string) =>
      mapping[target] ? (raw[mapping[target]] ?? "").trim() : ""

    const issues: BuiltRow["issues"] = []
    const name = get("name")
    const serial = get("serialNumber")
    const mpn = get("mpn")

    if (!name) {
      issues.push({
        reason: "Keine Bezeichnung — Zeile kann nicht importiert werden.",
        severity: "error",
      })
    }

    if (serialized) {
      if (!serial) {
        issues.push({
          reason: "Keine Seriennummer — Einzelstücke brauchen eine.",
          severity: "error",
        })
      } else {
        const normalized = normalizeReference(serial)
        if (seenInFile.has(normalized)) {
          issues.push({
            reason: "Seriennummer kommt in dieser Datei mehrfach vor.",
            severity: "warning",
          })
        } else {
          seenInFile.add(normalized)
        }

        const duplicate = unitBySerial.get(normalized)
        if (duplicate) {
          issues.push({
            reason: `Bereits im Bestand als ${duplicate.unitNumber}.`,
            severity: "warning",
          })
        }
      }
    }

    // Ein unlesbarer Preis darf nicht still zu 0 € werden — die Marge wäre
    // danach dauerhaft um den Einkaufspreis zu hoch, ohne jede Spur.
    const rawPurchase = get("purchasePriceCents")
    const purchaseCents = parseCents(rawPurchase)
    if (rawPurchase !== "" && purchaseCents === null) {
      issues.push({
        reason: `Einkaufspreis „${rawPurchase}" ist nicht lesbar — wird als 0 € übernommen.`,
        severity: "warning",
      })
    }

    const rawSale = get("salePriceCents")
    const saleCents = parseCents(rawSale)
    if (rawSale !== "" && saleCents === null) {
      issues.push({
        reason: `Verkaufspreis „${rawSale}" ist nicht lesbar — bleibt leer.`,
        severity: "warning",
      })
    }

    const rawQuantity = get("quantity")
    const quantity = rawQuantity === "" ? 1 : Number.parseInt(rawQuantity.replace(/\D/g, ""), 10)
    if (!serialized && rawQuantity !== "" && !Number.isFinite(quantity)) {
      issues.push({
        reason: `Menge „${rawQuantity}" ist nicht lesbar — Zeile wird übersprungen.`,
        severity: "error",
      })
    }

    const rawMileage = get("mileageKm")
    const mileageKm = Number.parseInt(rawMileage.replace(/\D/g, ""), 10)
    if (rawMileage !== "" && Number.isNaN(mileageKm)) {
      issues.push({
        reason: `Laufleistung „${rawMileage}" ist nicht lesbar — wird als 0 km übernommen.`,
        severity: "warning",
      })
    }

    const rawDate = get("purchaseDate")
    if (rawDate !== "" && !isReadableDate(rawDate)) {
      issues.push({
        reason: `Einkaufsdatum „${rawDate}" ist nicht lesbar — es wird das heutige Datum gesetzt.`,
        severity: "warning",
      })
    }

    if (!serialized && mpn && articleByMpn.has(normalizeReference(mpn))) {
      // Bewusst kein Fehler: Der Zugang landet auf dem vorhandenen Artikel.
      // Sichtbar bleibt es trotzdem, damit niemand einen zweiten Satz erwartet.
      issues.push({
        reason: `Teilenummer bekannt — wird als Zugang auf ${articleByMpn.get(normalizeReference(mpn))!.sku} gebucht.`,
        severity: "warning",
      })
    }

    const attributes: Record<string, string> = {}
    for (const attribute of settings.attributes) {
      const value = get(`attr:${attribute.key}`)
      if (value) attributes[attribute.key] = value
    }

    return {
      index: index + 1,
      issues,
      input: {
        name,
        manufacturer: get("manufacturer"),
        mpn,
        ean: get("ean"),
        serialNumber: serial,
        variant: get("variant"),
        color: get("color"),
        quantity: serialized ? 1 : Number.isFinite(quantity) ? quantity : 1,
        purchasePriceCents: purchaseCents ?? 0,
        salePriceCents: saleCents,
        mileageKm: Number.isNaN(mileageKm) ? 0 : mileageKm,
        condition: mapCondition(get("condition")),
        purchaseDate: parseGermanDate(rawDate),
        location: get("location"),
        notes: get("notes"),
        attributes,
      },
    }
  })
}

/**
 * Zustandsklassen aus Lieferantenlisten auf das SKOPE-Modell abbilden.
 * Unbekanntes wird bewusst zu "Gebraucht" — nicht geraten, sondern konservativ.
 */
function mapCondition(raw: string): Condition {
  const value = raw.trim().toUpperCase()
  if (["NEU", "NEUWARE"].includes(value)) return "NEU"
  if (["A", "A+", "WIE NEU", "NEUWERTIG"].includes(value)) return "WIE_NEU"
  if (["B", "SEHR GUT"].includes(value)) return "SEHR_GUT"
  if (["C", "GUT"].includes(value)) return "GUT"
  if (["D", "DEFEKT"].includes(value)) return "DEFEKT"
  return "GEBRAUCHT"
}

function isReadableDate(raw: string): boolean {
  const value = raw.trim()
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(value)) return true
  return !Number.isNaN(new Date(value).getTime())
}

/** Akzeptiert "02.08.2026" und "2026-08-02". Sonst: heute. */
function parseGermanDate(raw: string): string {
  const value = raw.trim()
  if (!value) return new Date().toISOString()

  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value)
  if (german) {
    return new Date(
      Number(german[3]),
      Number(german[2]) - 1,
      Number(german[1])
    ).toISOString()
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString()
}
