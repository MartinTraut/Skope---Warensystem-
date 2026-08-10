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
  Sparkles,
} from "lucide-react"

import { InlineSelect } from "@/components/skope/form"
import {
  DemoTag,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from "@/components/skope/primitives"
import { StatusPill } from "@/components/skope/status-pill"
import { Button } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import { useSavedMapping, useScooters } from "@/hooks/use-cockpit"
import { useCockpitStore } from "@/lib/store/cockpit-store"
import { parseFile, suggestMapping } from "@/lib/integrations/csv"
import { MockAvidesImportSource } from "@/lib/integrations/mock-adapters"
import type { ParsedTable } from "@/lib/integrations/types"
import { formatCents, parseCents } from "@/lib/domain/money"
import { findBySerial, normalizeSerial } from "@/lib/domain/scooter-factory"
import type { NewScooterInput } from "@/lib/domain/scooter-factory"
import {
  IMPORT_TARGET_FIELDS,
  type Condition,
  type ImportTargetField,
  type Scooter,
} from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/* Zielfelder                                                          */
/* ------------------------------------------------------------------ */

const FIELD_LABELS: Record<ImportTargetField, string> = {
  serialNumber: "Seriennummer",
  manufacturer: "Hersteller",
  model: "Modell",
  variant: "Variante",
  color: "Farbe",
  purchasePriceCents: "Einkaufspreis",
  salePriceCents: "Verkaufspreis",
  mileageKm: "Kilometerstand",
  condition: "Zustand",
  purchaseDate: "Einkaufsdatum",
  notes: "Bemerkung",
}

/** Ohne diese Felder ergibt ein Datensatz keinen Sinn. */
const REQUIRED_FIELDS: ImportTargetField[] = [
  "serialNumber",
  "manufacturer",
  "model",
]

const STEPS = [
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
 * Import-Assistent für Lieferantenlisten.
 *
 * Bewusst formatoffen: Es sind keine Spaltennamen fest verdrahtet, weil das
 * echte Avides-Format noch nicht vorliegt. Der Nutzer bestätigt die Zuordnung,
 * und diese Zuordnung wird für den nächsten Import gespeichert.
 */
export function ImportWizard() {
  const router = useRouter()
  const scooters = useScooters()
  const savedMapping = useSavedMapping()
  const setSavedMapping = useCockpitStore((state) => state.setSavedMapping)

  const [step, setStep] = useState<StepKey>("file")
  const [table, setTable] = useState<ParsedTable | null>(null)
  const [source, setSource] = useState<"AVIDES_DEMO" | "DATEI">("DATEI")
  const [mapping, setMapping] = useState<Record<ImportTargetField, string>>(
    emptyMapping()
  )
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{
    imported: number
    skipped: number
    total: number
  } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  /* ----- Datei laden ----- */

  function applyTable(next: ParsedTable, nextSource: "AVIDES_DEMO" | "DATEI") {
    setTable(next)
    setSource(nextSource)

    // Gespeichertes Mapping wiederverwenden, sofern die Spalten passen.
    const restored = emptyMapping()
    let restoredCount = 0
    if (savedMapping) {
      for (const entry of savedMapping) {
        if (entry.source && next.headers.includes(entry.source)) {
          restored[entry.target] = entry.source
          restoredCount += 1
        }
      }
    }

    setMapping(
      restoredCount >= 3
        ? restored
        : suggestMapping(next.headers, IMPORT_TARGET_FIELDS)
    )
    setStep("mapping")

    if (restoredCount >= 3) {
      toast.info("Gespeichertes Spalten-Mapping übernommen", {
        description: "Bitte trotzdem kurz prüfen.",
      })
    }
  }

  async function loadDemo() {
    setLoading(true)
    try {
      const demo = await new MockAvidesImportSource().loadDemoTable()
      applyTable(demo, "AVIDES_DEMO")
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
      // Lesefehler werden angezeigt, nicht verschluckt.
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
    () => (table ? buildRows(table, mapping, scooters) : []),
    [table, mapping, scooters]
  )

  const valid = rows.filter((row) => row.issues.length === 0)
  const problematic = rows.filter((row) => row.issues.length > 0)
  const missingRequired = REQUIRED_FIELDS.filter((field) => !mapping[field])

  /* ----- Import ----- */

  async function runImport() {
    if (!table) return

    setImporting(true)
    const response = await repositories.imports.importRows({
      fileName: table.fileName,
      source,
      rows: valid.map((row) => row.input),
    })
    setImporting(false)

    if (!response.ok) {
      toast.error("Import fehlgeschlagen", { description: response.message })
      return
    }

    setSavedMapping(
      IMPORT_TARGET_FIELDS.map((target) => ({ target, source: mapping[target] }))
    )
    setResult({
      imported: response.data.rowsImported,
      skipped: rows.length - response.data.rowsImported,
      total: rows.length,
    })
    setStep("done")

    toast.success(`${response.data.rowsImported} Scooter importiert`, {
      description:
        response.data.rowsSkipped > 0
          ? `${response.data.rowsSkipped} Zeilen wurden übersprungen.`
          : "Alle Zeilen wurden übernommen.",
    })
  }

  function restart() {
    setTable(null)
    setMapping(emptyMapping())
    setResult(null)
    setStep("file")
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import"
        description="Lieferantenlisten einlesen, Spalten zuordnen und als Scooter übernehmen."
        actions={<DemoTag>Demo-Daten verfügbar</DemoTag>}
      />

      <StepIndicator current={step} />

      {step === "file" && (
        <FileStep
          loading={loading}
          inputRef={inputRef}
          onPickFile={loadFile}
          onLoadDemo={loadDemo}
        />
      )}

      {step === "mapping" && table && (
        <MappingStep
          table={table}
          mapping={mapping}
          onChange={setMapping}
          missingRequired={missingRequired}
          onBack={restart}
          onNext={() => setStep("preview")}
        />
      )}

      {step === "preview" && table && (
        <PreviewStep
          table={table}
          rows={rows}
          onBack={() => setStep("mapping")}
          onNext={() => setStep("validate")}
        />
      )}

      {step === "validate" && table && (
        <ValidationStep
          valid={valid}
          problematic={problematic}
          importing={importing}
          onBack={() => setStep("preview")}
          onImport={runImport}
        />
      )}

      {step === "done" && result && (
        <DoneStep
          result={result}
          onRestart={restart}
          onOpenStock={() => router.push("/inbound")}
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
          <li key={step.key} className="flex shrink-0 items-center gap-1">
            <div
              className={cn(
                "flex h-9 items-center gap-2 rounded-lg border px-3 text-[0.8125rem] transition-colors",
                active
                  ? "border-skope-gold/40 bg-skope-gold/10 font-medium text-skope-gold"
                  : done
                    ? "border-skope-line bg-white/3 text-foreground/70"
                    : "border-skope-line text-muted-foreground/60"
              )}
            >
              <span
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-medium",
                  active
                    ? "bg-skope-gold text-[#14100a]"
                    : done
                      ? "bg-state-ready/20 text-state-ready"
                      : "bg-white/8 text-muted-foreground"
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

function FileStep({
  loading,
  inputRef,
  onPickFile,
  onLoadDemo,
}: {
  loading: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  onPickFile: (file: File) => void
  onLoadDemo: () => void
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <Panel>
        <PanelHeader
          title="Datei auswählen"
          description="CSV oder TSV mit einer Kopfzeile. Die Datei wird ausschließlich im Browser verarbeitet."
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
                ? "border-skope-gold/60 bg-skope-gold/8"
                : "border-skope-line-strong hover:border-skope-gold/35 hover:bg-white/2",
              "focus-visible:border-skope-gold/60 focus-visible:ring-3 focus-visible:ring-skope-gold/15 focus-visible:outline-none"
            )}
          >
            <FileUp
              className={cn(
                "size-7 transition-colors",
                dragOver ? "text-skope-gold" : "text-muted-foreground"
              )}
            />
            <p className="mt-4 text-sm font-medium text-foreground">
              {loading ? "Datei wird gelesen …" : "Datei hierher ziehen oder auswählen"}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Trennzeichen (Semikolon, Komma, Tab) wird automatisch erkannt.
            </p>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground/80">XLSX</strong> wird im
            Prototyp noch nicht gelesen — bitte vorerst als CSV exportieren. Die
            Unterstützung kommt zusammen mit der echten Avides-Anbindung.
          </p>
        </PanelBody>
      </Panel>

      <Panel accent>
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-skope-gold" />
              Demo-Datei
            </span>
          }
        />
        <PanelBody>
          <p className="text-sm leading-relaxed text-foreground/85">
            Eine erfundene Avides-Lieferliste mit zehn Zeilen — inklusive einer
            Dublette und einer Zeile ohne Seriennummer, damit die
            Fehlerbehandlung sichtbar wird.
          </p>
          <Button
            className="mt-4 h-10 w-full px-4"
            onClick={onLoadDemo}
            disabled={loading}
          >
            {loading ? "Wird geladen …" : "Demo-Datei verwenden"}
          </Button>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Die Spaltennamen der Demo-Datei sind ein Beispiel und nirgends im
            Code fest verdrahtet. Das echte Avides-Format wird beim ersten
            realen Export festgelegt.
          </p>
        </PanelBody>
      </Panel>
    </div>
  )
}

function MappingStep({
  table,
  mapping,
  onChange,
  missingRequired,
  onBack,
  onNext,
}: {
  table: ParsedTable
  mapping: Record<ImportTargetField, string>
  onChange: (mapping: Record<ImportTargetField, string>) => void
  missingRequired: ImportTargetField[]
  onBack: () => void
  onNext: () => void
}) {
  const options = [
    { value: "", label: "— nicht zuordnen —" },
    ...table.headers.map((header) => ({ value: header, label: header })),
  ]

  return (
    <Panel>
      <PanelHeader
        title="Spalten zuordnen"
        description={`${table.fileName} · ${table.headers.length} Spalten, ${table.rows.length} Zeilen`}
      />
      <PanelBody>
        {missingRequired.length > 0 && (
          <div className="mb-5 flex gap-2.5 rounded-lg border border-state-warn/25 bg-state-warn/8 p-3.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-state-warn" />
            <p className="text-xs leading-relaxed text-foreground/85">
              Pflichtfelder ohne Zuordnung:{" "}
              <strong>
                {missingRequired.map((field) => FIELD_LABELS[field]).join(", ")}
              </strong>
              . Ohne sie kann kein Datensatz angelegt werden.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {IMPORT_TARGET_FIELDS.map((field) => {
            const required = REQUIRED_FIELDS.includes(field)
            const sample = mapping[field]
              ? (table.rows.find((row) => row[mapping[field]])?.[
                  mapping[field]
                ] ?? "")
              : ""

            return (
              <div key={field} className="min-w-0">
                <label className="mb-1.5 flex items-center gap-1 text-[0.8125rem] font-medium text-foreground/90">
                  {FIELD_LABELS[field]}
                  {required && <span className="text-skope-gold">*</span>}
                </label>
                <InlineSelect
                  aria-label={`Quellspalte für ${FIELD_LABELS[field]}`}
                  className="h-11"
                  value={mapping[field]}
                  onChange={(event) =>
                    onChange({ ...mapping, [field]: event.target.value })
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
      </PanelBody>

      <WizardFooter
        onBack={onBack}
        backLabel="Andere Datei"
        onNext={onNext}
        nextLabel="Vorschau"
        nextDisabled={missingRequired.length > 0}
      />
    </Panel>
  )
}

function PreviewStep({
  table,
  rows,
  onBack,
  onNext,
}: {
  table: ParsedTable
  rows: BuiltRow[]
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
              <Th>Seriennummer</Th>
              <Th>Hersteller</Th>
              <Th>Modell</Th>
              <Th>Farbe</Th>
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
                  "transition-colors hover:bg-white/2",
                  row.issues.length > 0 && "bg-state-error/4"
                )}
              >
                <td className="py-2.5 pr-3 pl-5 text-xs text-muted-foreground tabular-nums">
                  {row.index}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-foreground">
                  {row.input.serialNumber || "—"}
                </td>
                <td className="px-3 py-2.5 text-foreground/85">
                  {row.input.manufacturer || "—"}
                </td>
                <td className="px-3 py-2.5 text-foreground/85">
                  {row.input.model || "—"}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {row.input.color || "—"}
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
  importing,
  onBack,
  onImport,
}: {
  valid: BuiltRow[]
  problematic: BuiltRow[]
  importing: boolean
  onBack: () => void
  onImport: () => void
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          label="Werden importiert"
          value={valid.length}
          tone="ready"
        />
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
            Beim Import werden{" "}
            <strong className="text-foreground">{valid.length} neue Scooter</strong>{" "}
            im Wareneingang angelegt. Jeder bekommt automatisch eine
            fortlaufende Scooter-Nummer und ein leeres Prüfprotokoll.
            Bestehende Datensätze werden dabei <strong>nie</strong> überschrieben.
          </p>
        </PanelBody>
        <WizardFooter
          onBack={onBack}
          backLabel="Zurück zur Vorschau"
          onNext={onImport}
          nextLabel={
            importing
              ? "Import läuft …"
              : `${valid.length} Scooter importieren`
          }
          nextDisabled={importing || valid.length === 0}
        />
      </Panel>
    </div>
  )
}

function DoneStep({
  result,
  onRestart,
  onOpenStock,
}: {
  result: { imported: number; skipped: number; total: number }
  onRestart: () => void
  onOpenStock: () => void
}) {
  return (
    <Panel accent>
      <PanelBody>
        <EmptyState
          icon={<Check className="size-5 text-state-ready" />}
          title={`${result.imported} Scooter importiert`}
          description={
            result.skipped > 0
              ? `${result.skipped} von ${result.total} Zeilen wurden übersprungen. Die Gründe stehen im Import-Protokoll unter Wareneingang.`
              : `Alle ${result.total} Zeilen wurden übernommen. Die Geräte liegen jetzt im Wareneingang und warten auf die Prüfung.`
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button className="h-10 px-4" onClick={onOpenStock}>
                Zum Wareneingang
              </Button>
              <Button
                variant="outline"
                className="h-10 px-4"
                onClick={onRestart}
              >
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
      <Button
        className="h-10 gap-2 px-4"
        onClick={onNext}
        disabled={nextDisabled}
      >
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
        "px-3 py-2.5 text-[10px] font-medium tracking-[0.1em] text-muted-foreground/80 uppercase",
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
  input: NewScooterInput
  issues: { reason: string; severity: "warning" | "error" }[]
}

/**
 * Übersetzt die Rohzeilen anhand des Mappings in SKOPE-Datensätze und prüft
 * sie. Dubletten werden sowohl gegen den Bestand als auch innerhalb der Datei
 * erkannt — eine Lieferliste kann dieselbe Seriennummer doppelt enthalten.
 */
function buildRows(
  table: ParsedTable,
  mapping: Record<ImportTargetField, string>,
  existing: Scooter[]
): BuiltRow[] {
  const seenInFile = new Set<string>()

  return table.rows.map((raw, index) => {
    const get = (field: ImportTargetField) =>
      mapping[field] ? (raw[mapping[field]] ?? "").trim() : ""

    const serial = get("serialNumber")
    const issues: BuiltRow["issues"] = []

    if (!serial) {
      issues.push({
        reason: "Keine Seriennummer — Zeile kann nicht importiert werden.",
        severity: "error",
      })
    } else {
      const normalized = normalizeSerial(serial)
      if (seenInFile.has(normalized)) {
        issues.push({
          reason: "Seriennummer kommt in dieser Datei mehrfach vor.",
          severity: "warning",
        })
      } else {
        seenInFile.add(normalized)
      }

      const duplicate = findBySerial(existing, serial)
      if (duplicate) {
        issues.push({
          reason: `Bereits im Bestand als ${duplicate.scooterNumber}.`,
          severity: "warning",
        })
      }
    }

    if (!get("manufacturer")) {
      issues.push({ reason: "Hersteller fehlt.", severity: "error" })
    }
    if (!get("model")) {
      issues.push({ reason: "Modell fehlt.", severity: "error" })
    }

    return {
      index: index + 1,
      issues,
      input: {
        serialNumber: serial,
        manufacturer: get("manufacturer"),
        model: get("model"),
        variant: get("variant"),
        color: get("color"),
        notes: get("notes"),
        mileageKm: Number.parseInt(get("mileageKm").replace(/\D/g, ""), 10) || 0,
        purchasePriceCents: parseCents(get("purchasePriceCents")) ?? 0,
        salePriceCents: parseCents(get("salePriceCents")),
        condition: mapCondition(get("condition")),
        purchaseDate: parseGermanDate(get("purchaseDate")),
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
  if (["A", "A+", "WIE NEU", "NEUWERTIG"].includes(value)) return "WIE_NEU"
  if (["B", "SEHR GUT"].includes(value)) return "SEHR_GUT"
  if (["C", "GUT"].includes(value)) return "GUT"
  if (["D", "DEFEKT"].includes(value)) return "DEFEKT"
  return "GEBRAUCHT"
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

function emptyMapping(): Record<ImportTargetField, string> {
  return Object.fromEntries(
    IMPORT_TARGET_FIELDS.map((field) => [field, ""])
  ) as Record<ImportTargetField, string>
}
