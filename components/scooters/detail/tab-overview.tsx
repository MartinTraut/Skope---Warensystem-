"use client"

import { FileCheck2, FileX2 } from "lucide-react"

import { ConditionBadge } from "../badges"
import { ReadinessPanel } from "./readiness-panel"
import {
  DataField,
  DataGrid,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/skope/primitives"
import { formatCents, formatDate, formatKm } from "@/lib/domain/money"
import {
  expectedMarginCents,
  marginPercent,
  repairCostsCents,
  totalCostCents,
} from "@/lib/domain/metrics"
import type { Scooter } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/** Stammdaten, Finanzen, Dokumente und technische Angaben. */
export function TabOverview({ scooter }: { scooter: Scooter }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Grunddaten" />
          <PanelBody>
            <DataGrid>
              <DataField label="Scooter-Nummer" value={scooter.scooterNumber} mono />
              <DataField
                label="Seriennummer"
                value={scooter.serialNumber || "—"}
                mono
              />
              <DataField label="Hersteller" value={scooter.manufacturer || "—"} />
              <DataField
                label="Modell"
                value={[scooter.model, scooter.variant].filter(Boolean).join(" ") || "—"}
              />
              <DataField label="Farbe" value={scooter.color || "—"} />
              <DataField label="Kilometerstand" value={formatKm(scooter.mileageKm)} />
              <DataField
                label="Zustand"
                value={<ConditionBadge condition={scooter.condition} />}
              />
              <DataField label="Standort" value={scooter.location || "—"} />
              <DataField
                label="Einkaufsdatum"
                value={formatDate(scooter.purchaseDate)}
              />
              <DataField
                label="Wareneingang"
                value={formatDate(scooter.arrivalDate)}
              />
            </DataGrid>

            {scooter.description && (
              <div className="mt-6 border-t border-skope-line pt-5">
                <p className="type-label">Beschreibung</p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/85">
                  {scooter.description}
                </p>
              </div>
            )}

            {scooter.notes && (
              <div className="mt-5 rounded-lg border border-skope-line bg-surface-sunken p-3.5">
                <p className="type-label">Interne Notiz</p>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">
                  {scooter.notes}
                </p>
              </div>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Technische Daten" />
          <PanelBody>
            {scooter.technicalData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine technischen Daten hinterlegt.
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
                {scooter.technicalData.map((spec) => (
                  <div
                    key={spec.key}
                    className="min-w-0 rounded-lg border border-skope-line bg-surface-sunken px-3.5 py-3"
                  >
                    <dt className="type-label">{spec.key}</dt>
                    <dd className="mt-1.5 truncate text-base font-medium text-foreground">
                      {spec.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </PanelBody>
        </Panel>
      </div>

      <div className="space-y-6">
        <FinancePanel scooter={scooter} />
        <DocumentsPanel scooter={scooter} />
        <ReadinessPanel scooter={scooter} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Finanzen                                                            */
/* ------------------------------------------------------------------ */

function FinancePanel({ scooter }: { scooter: Scooter }) {
  const repairs = repairCostsCents(scooter)
  const total = totalCostCents(scooter)
  const margin = expectedMarginCents(scooter)
  const percent =
    margin !== null && scooter.salePriceCents
      ? marginPercent(margin, scooter.salePriceCents)
      : null
  const sold = scooter.saleStatus === "VERKAUFT"

  return (
    <Panel>
      <PanelHeader title={sold ? "Realisierte Marge" : "Kalkulation"} />
      <PanelBody className="space-y-1.5">
        <FinanceRow label="Einkauf" value={formatCents(scooter.purchasePriceCents)} />
        <FinanceRow label="Reparaturen" value={formatCents(repairs)} />
        <FinanceRow
          label="Weitere Kosten"
          value={formatCents(scooter.additionalCostsCents)}
        />
        <div className="my-2.5 h-px bg-skope-line" />
        <FinanceRow label="Gesamtkosten" value={formatCents(total)} muted />
        <FinanceRow
          label="Verkaufspreis"
          value={formatCents(scooter.salePriceCents)}
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

function DocumentsPanel({ scooter }: { scooter: Scooter }) {
  const documents = [
    { label: "ABE / Betriebserlaubnis", present: scooter.documents.abe },
    { label: "Einkaufsrechnung", present: scooter.documents.invoice },
    { label: "Sonstige Papiere", present: scooter.documents.other },
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
        {scooter.documents.note && (
          <p className="mt-2 rounded-lg border border-state-warn/25 bg-state-warn/8 px-3 py-2 text-xs text-foreground/85">
            {scooter.documents.note}
          </p>
        )}
      </PanelBody>
    </Panel>
  )
}
