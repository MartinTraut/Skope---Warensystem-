"use client"

import { useMemo, useState, type InputHTMLAttributes } from "react"
import Link from "next/link"
import { Plus, Recycle, Trash2, Wrench } from "lucide-react"

import { DateTimeText } from "@/components/skope/client-time"
import { InlineSelect, SelectField, TextareaField } from "@/components/skope/form"
import {
  EmptyState,
  Metric,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from "@/components/skope/primitives"
import { StatusPill } from "@/components/skope/status-pill"
import { Button } from "@/components/ui/button"
import {
  useArticleViews,
  useHydrated,
  useLocations,
  useTeardowns,
  useUnitLookup,
  useUnitsInStock,
} from "@/hooks/use-cockpit"
import { repositories } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import { articleLabel, unitLabel } from "@/lib/domain/article-factory"
import { centsToInput, formatCents, parseCents } from "@/lib/domain/money"
import { TEARDOWN_DISTRIBUTION_META } from "@/lib/domain/status"
import {
  createTeardownLine,
  distributeTeardownValue,
  scrapShare,
  teardownPieceCount,
  teardownSourceValue,
  validateTeardown,
} from "@/lib/domain/teardown"
import {
  TEARDOWN_DISTRIBUTIONS,
  type TeardownDistribution,
  type TeardownLine,
} from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/**
 * Zahlenfeld, das sich leeren lässt.
 *
 * Ein kontrolliertes Feld, das jede Eingabe sofort in eine Zahl übersetzt,
 * schreibt beim Löschen des letzten Zeichens eine 0 zurück und stellt sie
 * sofort wieder in das Feld. Der Wert ließ sich damit nicht korrigieren,
 * sondern nur überschreiben — und wer „1200" durch „950" ersetzen wollte,
 * kämpfte gegen das eigene Formular. Solange getippt wird, gilt der getippte
 * Text; erst beim Verlassen zeigt das Feld wieder den gebuchten Wert.
 */
function DraftNumberInput({
  value,
  format,
  parse,
  onCommit,
  ...props
}: {
  value: number | null
  format: (value: number | null) => string
  parse: (text: string) => number | null
  onCommit: (value: number | null) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <input
      {...props}
      value={draft ?? format(value)}
      onChange={(event) => {
        setDraft(event.target.value)
        onCommit(parse(event.target.value))
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

/**
 * Ausschlachtung: ein Spendergerät in Ersatzteile zerlegen.
 *
 * Der zentrale Vorgang des Lagers. Ohne ihn verschwindet ein zerlegter Scooter
 * still aus dem Bestand und die Teile tauchen ohne Einstandswert auf — jede
 * spätere Marge wäre dann erfunden. Deshalb wird der Einkaufswert des Spenders
 * sichtbar auf die Teile verteilt, und was übrig bleibt, steht als Schrott da,
 * statt stillschweigend mitverteilt zu werden.
 */
export function TeardownView() {
  const hydrated = useHydrated()
  const unitsInStock = useUnitsInStock()
  const lookup = useUnitLookup()
  const views = useArticleViews()
  const locations = useLocations()
  const teardowns = useTeardowns()

  const [sourceUnitId, setSourceUnitId] = useState("")
  const [distribution, setDistribution] = useState<TeardownDistribution>("NACH_WERT")
  const [lines, setLines] = useState<TeardownLine[]>([])
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sourceUnit = unitsInStock.find((unit) => unit.id === sourceUnitId)
  const sourceValue = sourceUnit ? teardownSourceValue(sourceUnit) : 0

  /** Zielartikel: alles, was als Menge geführt wird. */
  const partOptions = useMemo(
    () =>
      views
        .filter((view) => view.article.stockMode === "MENGE")
        .filter((view) => view.article.archivedAt === null)
        .map((view) => ({
          value: view.article.id,
          label: `${view.article.sku} · ${articleLabel(view.article)}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "de")),
    [views]
  )

  const distributed = distributeTeardownValue(sourceValue, lines, distribution)
  const problem = validateTeardown({
    lines: distributed.lines,
    sourceValueCents: sourceValue,
    scrapValueCents: distributed.scrapValueCents,
  })

  function updateLine(id: string, patch: Partial<TeardownLine>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line))
    )
  }

  async function book() {
    if (!sourceUnit) {
      setError("Ohne Spendergerät gibt es nichts zu zerlegen.")
      return
    }
    if (problem) {
      setError(problem)
      return
    }

    setError(null)
    setBusy(true)
    const result = await runAction(
      repositories.teardowns.book({
        sourceUnitId: sourceUnit.id,
        distribution,
        lines: distributed.lines,
        note,
      }),
      {
        success: `${sourceUnit.unitNumber} ausgeschlachtet`,
        failure: "Ausschlachtung nicht gebucht",
      }
    )
    setBusy(false)

    if (result) {
      setSourceUnitId("")
      setLines([])
      setNote("")
    }
  }

  const totalPieces = distributed.lines.reduce(
    (sum, line) => sum + Math.max(0, line.quantity),
    0
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ausschlachtung"
        description="Ein Spendergerät zerlegen und die entnommenen Teile mit einem echten Einstandswert ins Lager buchen."
      />

      {!hydrated ? (
        <Panel>
          <PanelBody>
            <p className="text-sm text-muted-foreground">Daten werden geladen …</p>
          </PanelBody>
        </Panel>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel accent>
              <PanelHeader
                title="Spendergerät"
                description="Nur Geräte im Bestand lassen sich zerlegen."
              />
              <PanelBody className="space-y-4">
                <SelectField
                  label="Gerät"
                  placeholder="Gerät wählen"
                  value={sourceUnitId}
                  onChange={(event) => setSourceUnitId(event.target.value)}
                  options={unitsInStock.map((unit) => {
                    const article = lookup.article(unit)
                    return {
                      value: unit.id,
                      label: `${unit.unitNumber} · ${article ? unitLabel(article, unit) : "unbekannt"}`,
                    }
                  })}
                />

                {sourceUnit && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Metric
                      label="Einkauf"
                      value={formatCents(sourceUnit.purchasePriceCents)}
                    />
                    <Metric
                      label="Zusatzkosten"
                      value={formatCents(
                        sourceUnit.additionalCostsCents +
                          sourceUnit.repairs.reduce(
                            (sum, repair) => sum + repair.partCostCents,
                            0
                          )
                      )}
                    />
                    <Metric
                      label="Zu verteilen"
                      value={formatCents(sourceValue)}
                      accent
                    />
                  </div>
                )}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader
                title="Entnommene Teile"
                description="Jede Zeile bucht einen Zugang auf den Zielartikel."
                action={
                  <Button
                    variant="outline"
                    className="h-9 gap-2 px-3.5"
                    disabled={partOptions.length === 0}
                    onClick={() =>
                      setLines((current) => [
                        ...current,
                        createTeardownLine(partOptions[0]?.value ?? ""),
                      ])
                    }
                  >
                    <Plus className="size-4" />
                    Zeile
                  </Button>
                }
              />
              <PanelBody>
                {partOptions.length === 0 ? (
                  <EmptyState
                    title="Keine Ersatzteil-Artikel vorhanden"
                    description="Lege zuerst Artikel im Bereich Ersatzteile an — sie sind das Ziel der Buchung."
                    action={
                      <Link
                        href="/inventory"
                        className="inline-flex h-10 items-center rounded-lg border border-skope-line-strong px-4 text-sm transition-colors hover:border-skope-accent/40 hover:text-skope-accent"
                      >
                        Zum Bestand
                      </Link>
                    }
                  />
                ) : lines.length === 0 ? (
                  <EmptyState
                    icon={<Wrench className="size-5" />}
                    title="Noch keine Zeile"
                    description="Trage ein, was aus dem Gerät entnommen wurde — Display, Akku, Reifen, Controller."
                  />
                ) : (
                  <ul className="space-y-3">
                    {distributed.lines.map((line) => (
                      <li
                        key={line.id}
                        className="rounded-lg border border-skope-line bg-surface-sunken p-3.5"
                      >
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_5rem_minmax(0,1fr)_auto]">
                          <InlineSelect
                            aria-label="Zielartikel"
                            value={line.articleId}
                            onChange={(event) =>
                              updateLine(line.id, { articleId: event.target.value })
                            }
                            options={partOptions}
                          />
                          <DraftNumberInput
                            type="number"
                            min={1}
                            inputMode="numeric"
                            aria-label="Menge"
                            className="h-10 rounded-lg border border-skope-line bg-surface-raised px-2.5 text-right font-mono text-sm tabular-nums text-foreground focus:border-skope-accent/60 focus:ring-3 focus:ring-skope-accent/15 focus:outline-none"
                            value={line.quantity}
                            format={(quantity) => (quantity === null ? "" : String(quantity))}
                            parse={(text) => {
                              const parsed = Number.parseInt(text, 10)
                              return Number.isFinite(parsed) ? parsed : null
                            }}
                            onCommit={(quantity) =>
                              updateLine(line.id, { quantity: quantity ?? 0 })
                            }
                          />
                          {distribution === "MANUELL" ? (
                            <DraftNumberInput
                              aria-label="Einstandswert je Stück"
                              inputMode="decimal"
                              placeholder="Einstand je Stück"
                              className="h-10 rounded-lg border border-skope-line bg-surface-raised px-2.5 text-right font-mono text-sm tabular-nums text-foreground focus:border-skope-accent/60 focus:ring-3 focus:ring-skope-accent/15 focus:outline-none"
                              value={line.valueShareCents}
                              format={centsToInput}
                              parse={parseCents}
                              onCommit={(cents) =>
                                updateLine(line.id, { valueShareCents: cents ?? 0 })
                              }
                            />
                          ) : (
                            <DraftNumberInput
                              aria-label="Geschätzter Marktwert je Stück"
                              inputMode="decimal"
                              placeholder="Marktwert je Stück"
                              className="h-10 rounded-lg border border-skope-line bg-surface-raised px-2.5 text-right font-mono text-sm tabular-nums text-foreground focus:border-skope-accent/60 focus:ring-3 focus:ring-skope-accent/15 focus:outline-none"
                              value={line.marketValueCents}
                              format={centsToInput}
                              parse={parseCents}
                              onCommit={(cents) =>
                                updateLine(line.id, { marketValueCents: cents })
                              }
                            />
                          )}
                          <Button
                            variant="ghost"
                            className="size-10 shrink-0 p-0 text-muted-foreground hover:text-state-error"
                            aria-label="Zeile entfernen"
                            onClick={() =>
                              setLines((current) =>
                                current.filter((entry) => entry.id !== line.id)
                              )
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
                          <InlineSelect
                            aria-label="Lagerplatz"
                            className="w-52"
                            value={line.locationId ?? ""}
                            onChange={(event) =>
                              updateLine(line.id, {
                                locationId: event.target.value || null,
                              })
                            }
                            options={[
                              { value: "", label: "Ohne Lagerplatz" },
                              ...locations.map((location) => ({
                                value: location.id,
                                label: `${location.code} – ${location.name}`,
                              })),
                            ]}
                          />
                          <span className="text-xs text-muted-foreground">
                            Einstand je Stück{" "}
                            <span className="font-mono text-foreground tabular-nums">
                              {formatCents(line.valueShareCents)}
                            </span>{" "}
                            · Zeile{" "}
                            <span className="font-mono text-foreground tabular-nums">
                              {formatCents(
                                line.valueShareCents * Math.max(0, line.quantity)
                              )}
                            </span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </PanelBody>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel>
              <PanelHeader
                title="Verteilung"
                description="Wie kommt der Einkaufswert des Spenders auf die Teile?"
              />
              <PanelBody className="space-y-3">
                <div className="space-y-2">
                  {TEARDOWN_DISTRIBUTIONS.map((entry) => {
                    const meta = TEARDOWN_DISTRIBUTION_META[entry]
                    const active = distribution === entry
                    return (
                      <button
                        key={entry}
                        type="button"
                        onClick={() => setDistribution(entry)}
                        className={cn(
                          "w-full rounded-lg border px-3.5 py-3 text-left transition-colors duration-150",
                          "focus-visible:ring-3 focus-visible:ring-skope-accent/25 focus-visible:outline-none",
                          active
                            ? "border-skope-accent/50 bg-skope-accent/8"
                            : "border-skope-line bg-surface-sunken hover:border-skope-line-strong"
                        )}
                        aria-pressed={active}
                      >
                        <span className="block text-sm font-medium text-foreground">
                          {meta.label}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                          {meta.description}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="border-t border-skope-line pt-3">
                  <SummaryRow label="Teile gesamt" value={`${totalPieces} Stück`} />
                  <SummaryRow
                    label="Verteilt"
                    value={formatCents(sourceValue - distributed.scrapValueCents)}
                  />
                  <SummaryRow
                    label="Schrott / Rest"
                    value={formatCents(distributed.scrapValueCents)}
                    tone={distributed.scrapValueCents < 0 ? "error" : undefined}
                  />
                </div>

                <TextareaField
                  label="Notiz"
                  rows={2}
                  placeholder="z. B. Rahmen verzogen, Rest verschrottet"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />

                {(error || problem) && sourceUnit && (
                  <p className="rounded-lg border border-state-warn/25 bg-state-warn/8 px-3 py-2 text-xs text-state-warn">
                    {error ?? problem}
                  </p>
                )}

                <Button
                  className="h-11 w-full"
                  disabled={!sourceUnit || problem !== null || busy}
                  onClick={book}
                >
                  {busy ? "Wird gebucht …" : "Ausschlachtung buchen"}
                </Button>
                <p className="type-caption leading-relaxed text-muted-foreground">
                  Das Spendergerät geht auf „Ausgeschlachtet“, jede Zeile erzeugt
                  einen Zugang. Beides zusammen oder gar nicht.
                </p>
              </PanelBody>
            </Panel>
          </div>
        </div>
      )}

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Bisherige Ausschlachtungen"
          description="Nachvollziehbar, welches Gerät welche Teile ergeben hat."
        />
        {teardowns.length === 0 ? (
          <EmptyState
            icon={<Recycle className="size-5" />}
            title="Noch keine Ausschlachtung"
            description="Sobald ein Gerät zerlegt wurde, steht der Vorgang hier mit Wertverteilung."
          />
        ) : (
          <ul className="divide-y divide-skope-line">
            {[...teardowns]
              .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
              .map((teardown) => (
                <li
                  key={teardown.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-foreground">
                        {teardown.sourceNumber}
                      </span>
                      <StatusPill
                        tone={TEARDOWN_DISTRIBUTION_META[teardown.distribution].tone}
                        size="sm"
                        dot={false}
                      >
                        {TEARDOWN_DISTRIBUTION_META[teardown.distribution].label}
                      </StatusPill>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {teardown.sourceLabel} · {teardownPieceCount(teardown)} Teile
                      {teardown.note && ` · ${teardown.note}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-5 text-xs">
                    <span className="text-muted-foreground">
                      Wert{" "}
                      <span className="font-mono text-foreground tabular-nums">
                        {formatCents(teardown.sourceValueCents)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      Schrott{" "}
                      <span className="font-mono text-foreground tabular-nums">
                        {Math.round(scrapShare(teardown) * 100)} %
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-muted-foreground">
                      <DateTimeText iso={teardown.at} />
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "error"
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          tone === "error" ? "text-state-error" : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  )
}
