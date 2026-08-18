"use client"

import { Check, CircleAlert } from "lucide-react"

import {
  DataField,
  DataGrid,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/skope/primitives"
import { useArticleReadiness } from "@/hooks/use-cockpit"
import { formatCents, formatDate, formatNumber } from "@/lib/domain/money"
import { CONDITION_META } from "@/lib/domain/status"
import type { ArticleView } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/** Stammdaten, Merkmale, Bewertung und offene Voraussetzungen eines Artikels. */
export function TabArticleOverview({ view }: { view: ArticleView }) {
  const { article, settings, stock } = view
  const isBulk = article.stockMode === "MENGE"

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Grunddaten" />
          <PanelBody>
            <DataGrid>
              <DataField label="Artikelnummer" value={article.sku} mono />
              <DataField label="Bezeichnung" value={article.name} />
              <DataField label="Hersteller" value={article.manufacturer || "—"} />
              <DataField label="Teilenummer" value={article.mpn || "—"} mono />
              <DataField label="EAN" value={article.ean || "—"} mono />
              <DataField label="Bereich" value={settings.pathLabel || "—"} />
              <DataField
                label="Zustand"
                value={CONDITION_META[article.condition].label}
              />
              <DataField label="Angelegt" value={formatDate(article.createdAt)} />
            </DataGrid>

            {article.description && (
              <div className="mt-6 border-t border-skope-line pt-5">
                <p className="type-label">Beschreibung</p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/85">
                  {article.description}
                </p>
              </div>
            )}

            {article.notes && (
              <div className="mt-5 rounded-lg border border-skope-line bg-surface-sunken p-3.5">
                <p className="type-label">Interne Notiz</p>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">
                  {article.notes}
                </p>
              </div>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Merkmale"
            description="Die Felder kommen aus dem Bereich und erben sich über den Pfad nach unten."
          />
          <PanelBody>
            {settings.attributes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Für diesen Bereich sind keine Merkmalsfelder definiert.
              </p>
            ) : (
              <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {settings.attributes.map((definition) => {
                  const value = article.attributes[definition.key]?.trim()
                  return (
                    <div
                      key={definition.key}
                      className={cn(
                        "min-w-0 rounded-lg border bg-surface-sunken px-3.5 py-3",
                        !value && definition.required
                          ? "border-state-warn/30"
                          : "border-skope-line"
                      )}
                    >
                      <dt className="type-label">{definition.label}</dt>
                      <dd className="mt-1.5 truncate text-base font-medium text-foreground">
                        {value
                          ? `${value}${definition.unit ? ` ${definition.unit}` : ""}`
                          : "—"}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            )}
          </PanelBody>
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Bewertung" />
          <PanelBody className="space-y-1.5">
            {isBulk ? (
              <>
                <Row label="Bestand" value={`${formatNumber(stock.quantity)} Stück`} />
                <Row
                  label="Einstand ⌀"
                  value={formatCents(stock.averageCostCents)}
                />
                <div className="my-2.5 h-px bg-skope-line" />
                <Row label="Lagerwert" value={formatCents(stock.valueCents)} strong />
                <Row
                  label="Verkaufspreis"
                  value={formatCents(article.salePriceCents)}
                />
                {article.salePriceCents !== null && (
                  <Row
                    label="Marge je Stück"
                    value={formatCents(
                      article.salePriceCents - stock.averageCostCents
                    )}
                    tone={
                      article.salePriceCents - stock.averageCostCents < 0
                        ? "error"
                        : "ready"
                    }
                  />
                )}
                <p className="pt-2 type-caption leading-relaxed text-muted-foreground">
                  Bewertet wird mit gleitendem Durchschnitt. Für Teile aus
                  Ausschlachtungen gibt es keine saubere Chargenfolge, an der
                  sich FIFO festmachen ließe.
                </p>
              </>
            ) : (
              <>
                <Row
                  label="Geräte im Bestand"
                  value={formatNumber(view.unitsInStock.length)}
                />
                <Row label="Geräte gesamt" value={formatNumber(view.units.length)} />
                <div className="my-2.5 h-px bg-skope-line" />
                <Row
                  label="Gebundenes Kapital"
                  value={formatCents(
                    view.unitsInStock.reduce(
                      (sum, unit) =>
                        sum + unit.purchasePriceCents + unit.additionalCostsCents,
                      0
                    )
                  )}
                  strong
                />
                <Row
                  label="Richtpreis"
                  value={formatCents(article.salePriceCents)}
                />
                <p className="pt-2 type-caption leading-relaxed text-muted-foreground">
                  Jedes Gerät rechnet einzeln — Einkauf, Reparaturen und Marge
                  stehen am Gerät, nicht am Artikel.
                </p>
              </>
            )}
          </PanelBody>
        </Panel>

        <ReadinessPanel view={view} />
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: "ready" | "error"
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong && "font-medium",
          tone === "error"
            ? "text-state-error"
            : tone === "ready"
              ? "text-state-ready"
              : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Freigabe                                                            */
/* ------------------------------------------------------------------ */

function ReadinessPanel({ view }: { view: ArticleView }) {
  const checks = useArticleReadiness(view)
  const open = checks.filter((check) => !check.ok)
  const ready = open.length === 0

  if (checks.length === 0) return null

  return (
    <Panel accent={ready} tone={ready ? undefined : "warn"}>
      <PanelHeader
        tone={ready ? undefined : "warn"}
        title="Freigabe"
        description={
          ready
            ? "Alle Voraussetzungen für ein Inserat sind erfüllt."
            : `${open.length} offene Voraussetzung${open.length === 1 ? "" : "en"}.`
        }
      />
      <PanelBody className="p-3 sm:p-3">
        <ul className="space-y-0.5">
          {checks.map((check) => (
            <li
              key={check.label}
              className="flex items-start gap-2.5 rounded-lg px-2.5 py-2"
            >
              {check.ok ? (
                <Check className="mt-0.5 size-4 shrink-0 text-state-ready" />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-state-warn" />
              )}
              <span className="min-w-0">
                <span
                  className={cn(
                    "block type-body-sm",
                    check.ok ? "text-foreground/85" : "text-foreground"
                  )}
                >
                  {check.label}
                </span>
                {!check.ok && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {check.hint}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </PanelBody>
    </Panel>
  )
}
