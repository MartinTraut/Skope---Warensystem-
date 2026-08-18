"use client"

import { FileCheck2, FileX2 } from "lucide-react"

import { ConditionBadge } from "@/components/shared/badges"
import { ReadinessPanel } from "./readiness-panel"
import {
  DataField,
  DataGrid,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/skope/primitives"
import Link from "next/link"

import { useArticle, useCategorySettings, useLocations } from "@/hooks/use-cockpit"
import { articleLabel, mergedAttributes } from "@/lib/domain/article-factory"
import { formatCents, formatDate, formatKm } from "@/lib/domain/money"
import {
  expectedMarginCents,
  marginPercent,
  repairCostsCents,
  totalCostCents,
} from "@/lib/domain/metrics"
import type { ArticleUnit } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/** Stammdaten, Finanzen, Dokumente und Merkmale. */
export function TabOverview({ unit }: { unit: ArticleUnit }) {
  const article = useArticle(unit.articleId)
  const settings = useCategorySettings(article?.categoryId)
  const locations = useLocations()

  const location = locations.find((entry) => entry.id === unit.locationId)
  const values = article ? mergedAttributes(article, unit) : {}

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Grunddaten" />
          <PanelBody>
            <DataGrid>
              <DataField label="Gerätenummer" value={unit.unitNumber} mono />
              <DataField
                label="Seriennummer"
                value={unit.serialNumber || "—"}
                mono
              />
              <DataField
                label="Artikel"
                value={
                  article ? (
                    <Link
                      href={`/inventory/${article.id}`}
                      className="rounded text-foreground underline-offset-4 transition-colors hover:text-skope-accent hover:underline"
                    >
                      {articleLabel(article)}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <DataField label="Bereich" value={settings.pathLabel || "—"} />
              <DataField label="Variante" value={unit.variant || "—"} />
              <DataField label="Farbe" value={unit.color || "—"} />
              <DataField label="Kilometerstand" value={formatKm(unit.mileageKm)} />
              <DataField
                label="Zustand"
                value={<ConditionBadge condition={unit.condition} />}
              />
              <DataField
                label="Lagerplatz"
                value={location ? `${location.code} – ${location.name}` : "—"}
              />
              <DataField
                label="Einkaufsdatum"
                value={formatDate(unit.purchaseDate)}
              />
              <DataField
                label="Wareneingang"
                value={formatDate(unit.arrivalDate)}
              />
            </DataGrid>

            {unit.description && (
              <div className="mt-6 border-t border-skope-line pt-5">
                <p className="type-label">Beschreibung</p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/85">
                  {unit.description}
                </p>
              </div>
            )}

            {unit.notes && (
              <div className="mt-5 rounded-lg border border-skope-line bg-surface-sunken p-3.5">
                <p className="type-label">Interne Notiz</p>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">
                  {unit.notes}
                </p>
              </div>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Merkmale"
            description="Aus dem Bereich geerbt; gerätespezifische Angaben überlagern die des Artikels."
          />
          <PanelBody>
            {settings.attributes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Für diesen Bereich sind keine Merkmalsfelder definiert.
              </p>
            ) : (
              /*
                Kacheln statt Zeilen.

                Vorher stand die Bezeichnung ganz links und der Wert ganz
                rechts — über die volle Panelbreite lagen bis zu 60 cm
                zwischen beiden, und das Auge musste die Zeile halten. In der
                Kachel steht der Wert direkt unter seiner Bezeichnung.
              */
              <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {settings.attributes.map((definition) => (
                  <div
                    key={definition.key}
                    className="min-w-0 rounded-lg border border-skope-line bg-surface-sunken px-3.5 py-3"
                  >
                    <dt className="type-label">{definition.label}</dt>
                    <dd className="mt-1.5 truncate text-base font-medium text-foreground">
                      {values[definition.key]?.trim()
                        ? `${values[definition.key]}${definition.unit ? ` ${definition.unit}` : ""}`
                        : "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </PanelBody>
        </Panel>
      </div>

      <div className="space-y-6">
        <FinancePanel unit={unit} />
        <DocumentsPanel unit={unit} />
        <ReadinessPanel unit={unit} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Finanzen                                                            */
/* ------------------------------------------------------------------ */

function FinancePanel({ unit }: { unit: ArticleUnit }) {
  const repairs = repairCostsCents(unit)
  const total = totalCostCents(unit)
  const margin = expectedMarginCents(unit)
  const percent =
    margin !== null && unit.salePriceCents
      ? marginPercent(margin, unit.salePriceCents)
      : null
  const sold = unit.saleStatus === "VERKAUFT"

  return (
    <Panel>
      <PanelHeader title={sold ? "Realisierte Marge" : "Kalkulation"} />
      <PanelBody className="space-y-1.5">
        <FinanceRow label="Einkauf" value={formatCents(unit.purchasePriceCents)} />
        <FinanceRow label="Reparaturen" value={formatCents(repairs)} />
        <FinanceRow
          label="Weitere Kosten"
          value={formatCents(unit.additionalCostsCents)}
        />
        <div className="my-2.5 h-px bg-skope-line" />
        <FinanceRow label="Gesamtkosten" value={formatCents(total)} muted />
        <FinanceRow
          label="Verkaufspreis"
          value={formatCents(unit.salePriceCents)}
          strong
        />
        <div className="my-2.5 h-px bg-skope-line" />
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-muted-foreground">
            {sold ? "Marge" : "Erwartete Marge"}
          </span>
          <span className="text-right">
            <span
              className={cn(
                "text-lg font-medium tabular-nums",
                margin === null
                  ? "text-muted-foreground"
                  : margin < 0
                    ? "text-state-error"
                    : "text-state-ready"
              )}
            >
              {formatCents(margin)}
            </span>
            {percent !== null && (
              <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                {percent.toLocaleString("de-DE")} %
              </span>
            )}
          </span>
        </div>

        <p className="pt-2 type-caption leading-relaxed text-muted-foreground">
          Operative Rechengröße. Steuerliche Betrachtung — insbesondere eine
          mögliche Differenzbesteuerung — ist bewusst nicht abgebildet.
        </p>
      </PanelBody>
    </Panel>
  )
}

function FinanceRow({
  label,
  value,
  strong,
  muted,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong && "font-medium",
          muted ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Dokumente                                                           */
/* ------------------------------------------------------------------ */

function DocumentsPanel({ unit }: { unit: ArticleUnit }) {
  const documents = [
    { label: "ABE / Betriebserlaubnis", present: unit.documents.abe },
    { label: "Einkaufsrechnung", present: unit.documents.invoice },
    { label: "Sonstige Papiere", present: unit.documents.other },
  ]

  return (
    <Panel>
      <PanelHeader title="Dokumente" />
      <PanelBody className="p-3 sm:p-3">
        <ul className="space-y-0.5">
          {documents.map((document) => (
            <li
              key={document.label}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2"
            >
              {document.present ? (
                <FileCheck2 className="size-4 shrink-0 text-state-ready" />
              ) : (
                <FileX2 className="size-4 shrink-0 text-muted-foreground/50" />
              )}
              <span
                className={cn(
                  "type-body-sm",
                  document.present ? "text-foreground/85" : "text-muted-foreground"
                )}
              >
                {document.label}
              </span>
            </li>
          ))}
        </ul>
        {unit.documents.note && (
          <p className="mt-2 rounded-lg border border-state-warn/25 bg-state-warn/8 px-3 py-2 text-xs text-foreground/85">
            {unit.documents.note}
          </p>
        )}
      </PanelBody>
    </Panel>
  )
}
