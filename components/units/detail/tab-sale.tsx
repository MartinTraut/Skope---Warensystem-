"use client"

import { useState } from "react"
import { toast } from "sonner"
import { BookmarkCheck, BookmarkX } from "lucide-react"

import { SaleBadge, SyncBadge } from "@/components/shared/badges"
import { CancelSaleButton } from "@/components/sales/cancel-sale"
import { MarkAsSoldDialog } from "../mark-as-sold-dialog"
import {
  DataField,
  DataGrid,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/skope/primitives"
import { MoneyField } from "@/components/skope/form"
import { Button } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import type { ActionResult } from "@/lib/data/repository"
import { runAction } from "@/lib/data/run-action"
import { useSales } from "@/hooks/use-cockpit"
import {
  centsToInput,
  formatCents,
  formatDateTime,
  parseCents,
} from "@/lib/domain/money"
import { saleMarginCents } from "@/lib/domain/metrics"
import { SALE_CHANNEL_META } from "@/lib/domain/status"
import type { ArticleUnit } from "@/lib/domain/types"

/** Preisgestaltung, Reservierung und Verkaufsabschluss. */
export function TabSale({ unit }: { unit: ArticleUnit }) {
  const sales = useSales()
  const sale = sales.find((entry) => entry.unitId === unit.id)
  const [soldOpen, setSoldOpen] = useState(false)
  // Sperrt die Schaltflächen für die Dauer eines Vorgangs — sonst löst ein
  // zweiter Tap während der simulierten Latenz eine zweite Buchung aus.
  const [busy, setBusy] = useState(false)

  async function run<T>(
    action: Promise<ActionResult<T>>,
    messages: { success: string; failure: string }
  ) {
    setBusy(true)
    try {
      await runAction(action, messages)
    } finally {
      setBusy(false)
    }
  }

  if (unit.saleStatus === "VERKAUFT" && sale) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Panel>
          <PanelHeader
            title="Verkauf"
            action={<SaleBadge status="VERKAUFT" size="sm" />}
          />
          <PanelBody>
            <DataGrid className="sm:grid-cols-2 lg:grid-cols-3">
              <DataField
                label="Verkaufsdatum"
                value={formatDateTime(sale.soldAt)}
              />
              <DataField
                label="Verkaufskanal"
                value={SALE_CHANNEL_META[sale.channel].label}
              />
              <DataField
                label="Verkaufspreis"
                value={formatCents(sale.salePriceCents)}
              />
              <DataField
                label="Einkauf"
                value={formatCents(sale.purchasePriceCents)}
              />
              <DataField
                label="Reparaturen"
                value={formatCents(sale.repairCostsCents)}
              />
              <DataField
                label="Realisierte Marge"
                value={formatCents(saleMarginCents(sale))}
              />
            </DataGrid>

            {sale.note && (
              <div className="mt-6 rounded-lg border border-skope-line bg-surface-sunken p-3.5">
                <p className="type-label">Notiz</p>
                <p className="mt-1.5 text-sm text-foreground/85">{sale.note}</p>
              </div>
            )}

            {/* Der Weg zurück: Widerruf, Retoure oder schlicht falsch erfasst. */}
            <div className="mt-6 flex items-center justify-between gap-3 border-t border-skope-line pt-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Storniert den Verkauf mit Gegenbuchung. Das Gerät geht dabei
                wahlweise zurück in den Bestand.
              </p>
              <CancelSaleButton sale={sale} />
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Reporting"
            action={<SyncBadge status={sale.sheetsSyncStatus} />}
          />
          <PanelBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {sale.sheetsSyncStatus === "SYNCHRONISIERT"
                ? `Verkaufszeile geschrieben am ${formatDateTime(sale.sheetsSyncedAt)}.`
                : sale.sheetsSyncStatus === "FEHLER"
                  ? sale.sheetsError
                  : "Die Übertragung in die Umsatztabelle läuft."}
            </p>
            {sale.sheetsSyncStatus === "FEHLER" && (
              <Button
                className="w-full"
                disabled={busy}
                onClick={() =>
                  run(repositories.sales.retrySheetsSync(sale.id), {
                    success: "Google Sheets synchronisiert",
                    failure: "Synchronisation erneut fehlgeschlagen",
                  })
                }
              >
                Erneut versuchen
              </Button>
            )}
          </PanelBody>
        </Panel>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <PricingPanel unit={unit} />

      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Verkaufsstatus" />
          <PanelBody className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Aktuell</span>
              <SaleBadge status={unit.saleStatus} />
            </div>

            {unit.saleStatus === "VERFUEGBAR" ? (
              <Button
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() =>
                  run(
                    repositories.units.updateSaleStatus(unit.id, "RESERVIERT"),
                    { success: "Gerät reserviert", failure: "Nicht reserviert" }
                  )
                }
              >
                <BookmarkCheck className="size-4" />
                Reservieren
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() =>
                  run(
                    repositories.units.updateSaleStatus(unit.id, "VERFUEGBAR"),
                    {
                      success: "Reservierung aufgehoben",
                      failure: "Reservierung konnte nicht aufgehoben werden",
                    }
                  )
                }
              >
                <BookmarkX className="size-4" />
                Reservierung aufheben
              </Button>
            )}

            <Button
              size="lg"
              className="w-full"
              onClick={() => setSoldOpen(true)}
            >
              Als verkauft markieren
            </Button>

            <p className="type-caption leading-relaxed text-muted-foreground">
              Der Verkauf wird zentral erfasst — unabhängig davon, über welchen
              Kanal er zustande kam. Anschließend werden alle Kanäle deaktiviert.
            </p>
          </PanelBody>
        </Panel>
      </div>

      <MarkAsSoldDialog
        unit={unit}
        open={soldOpen}
        onOpenChange={setSoldOpen}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Preisgestaltung                                                     */
/* ------------------------------------------------------------------ */

function PricingPanel({ unit }: { unit: ArticleUnit }) {
  const [purchase, setPurchase] = useState(
    centsToInput(unit.purchasePriceCents)
  )
  const [additional, setAdditional] = useState(
    centsToInput(unit.additionalCostsCents)
  )
  const [sale, setSale] = useState(centsToInput(unit.salePriceCents))
  const [saving, setSaving] = useState(false)

  // Externe Änderungen (z. B. durch den simulierten Verkauf) in die Felder
  // spiegeln. Der Abgleich läuft über eine Signatur der gespeicherten Werte:
  // Ändert sie sich, wurden die Daten außerhalb dieses Formulars angepasst.
  const storedSignature = [
    unit.purchasePriceCents,
    unit.additionalCostsCents,
    unit.salePriceCents,
  ].join("|")
  const [lastSignature, setLastSignature] = useState(storedSignature)
  if (storedSignature !== lastSignature) {
    setLastSignature(storedSignature)
    setPurchase(centsToInput(unit.purchasePriceCents))
    setAdditional(centsToInput(unit.additionalCostsCents))
    setSale(centsToInput(unit.salePriceCents))
  }

  const dirty =
    purchase !== centsToInput(unit.purchasePriceCents) ||
    additional !== centsToInput(unit.additionalCostsCents) ||
    sale !== centsToInput(unit.salePriceCents)

  async function save() {
    setSaving(true)
    const result = await repositories.units.update(unit.id, {
      purchasePriceCents: parseCents(purchase) ?? 0,
      additionalCostsCents: parseCents(additional) ?? 0,
      salePriceCents: parseCents(sale),
    })
    setSaving(false)

    if (!result.ok) {
      toast.error("Nicht gespeichert", { description: result.message })
      return
    }
    toast.success("Preise gespeichert")
  }

  return (
    <Panel>
      <PanelHeader
        title="Preise"
        description="Grundlage für Veröffentlichung und Margenberechnung."
        action={
          dirty && (
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "…" : "Speichern"}
            </Button>
          )
        }
      />
      <PanelBody>
        <div className="grid gap-4 sm:grid-cols-3">
          <MoneyField
            label="Einkaufspreis"
            value={purchase}
            onChange={(event) => setPurchase(event.target.value)}
          />
          <MoneyField
            label="Weitere Kosten"
            hint="Versand, Zubehör …"
            value={additional}
            onChange={(event) => setAdditional(event.target.value)}
          />
          <MoneyField
            label="Verkaufspreis"
            value={sale}
            onChange={(event) => setSale(event.target.value)}
          />
        </div>

        {dirty && (
          <p className="mt-4 rounded-lg border border-skope-accent/25 bg-skope-accent/6 px-3 py-2 text-xs text-foreground/85">
            Ungespeicherte Änderungen — auf {"\u201eSpeichern\u201c"} tippen,
            um sie zu übernehmen.
          </p>
        )}
      </PanelBody>
    </Panel>
  )
}
