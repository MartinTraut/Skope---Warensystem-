"use client"

import { useState } from "react"
import { toast } from "sonner"
import { BookmarkCheck, BookmarkX } from "lucide-react"

import { SaleBadge, SyncBadge } from "../badges"
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
import { useSales } from "@/hooks/use-cockpit"
import {
  centsToInput,
  formatCents,
  formatDateTime,
  parseCents,
} from "@/lib/domain/money"
import { saleMarginCents } from "@/lib/domain/metrics"
import { SALE_CHANNEL_META } from "@/lib/domain/status"
import type { Scooter } from "@/lib/domain/types"

/** Preisgestaltung, Reservierung und Verkaufsabschluss. */
export function TabSale({ scooter }: { scooter: Scooter }) {
  const sales = useSales()
  const sale = sales.find((entry) => entry.scooterId === scooter.id)
  const [soldOpen, setSoldOpen] = useState(false)

  if (scooter.saleStatus === "VERKAUFT" && sale) {
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
              <div className="mt-6 rounded-lg border border-skope-line bg-white/2 p-3.5">
                <p className="type-label">Notiz</p>
                <p className="mt-1.5 text-sm text-foreground/85">{sale.note}</p>
              </div>
            )}
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
                className="h-10 w-full px-4"
                onClick={async () => {
                  const result = await repositories.sales.retrySheetsSync(sale.id)
                  if (!result.ok) {
                    toast.error("Synchronisation erneut fehlgeschlagen", {
                      description: result.message,
                    })
                    return
                  }
                  toast.success("Google Sheets synchronisiert")
                }}
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
      <PricingPanel scooter={scooter} />

      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Verkaufsstatus" />
          <PanelBody className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Aktuell</span>
              <SaleBadge status={scooter.saleStatus} />
            </div>

            {scooter.saleStatus === "VERFUEGBAR" ? (
              <Button
                variant="outline"
                className="h-10 w-full gap-2 px-4"
                onClick={async () => {
                  const result = await repositories.scooters.updateSaleStatus(
                    scooter.id,
                    "RESERVIERT"
                  )
                  if (!result.ok) {
                    toast.error("Nicht reserviert", { description: result.message })
                    return
                  }
                  toast.success("Scooter reserviert")
                }}
              >
                <BookmarkCheck className="size-4" />
                Reservieren
              </Button>
            ) : (
              <Button
                variant="outline"
                className="h-10 w-full gap-2 px-4"
                onClick={async () => {
                  await repositories.scooters.updateSaleStatus(
                    scooter.id,
                    "VERFUEGBAR"
                  )
                  toast.success("Reservierung aufgehoben")
                }}
              >
                <BookmarkX className="size-4" />
                Reservierung aufheben
              </Button>
            )}

            <Button
              className="h-11 w-full px-4"
              onClick={() => setSoldOpen(true)}
            >
              Als verkauft markieren
            </Button>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Der Verkauf wird zentral erfasst — unabhängig davon, über welchen
              Kanal er zustande kam. Anschließend werden alle Kanäle deaktiviert.
            </p>
          </PanelBody>
        </Panel>
      </div>

      <MarkAsSoldDialog
        scooter={scooter}
        open={soldOpen}
        onOpenChange={setSoldOpen}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Preisgestaltung                                                     */
/* ------------------------------------------------------------------ */

function PricingPanel({ scooter }: { scooter: Scooter }) {
  const [purchase, setPurchase] = useState(
    centsToInput(scooter.purchasePriceCents)
  )
  const [additional, setAdditional] = useState(
    centsToInput(scooter.additionalCostsCents)
  )
  const [sale, setSale] = useState(centsToInput(scooter.salePriceCents))
  const [saving, setSaving] = useState(false)

  // Externe Änderungen (z. B. durch den simulierten Verkauf) in die Felder
  // spiegeln. Der Abgleich läuft über eine Signatur der gespeicherten Werte:
  // Ändert sie sich, wurden die Daten außerhalb dieses Formulars angepasst.
  const storedSignature = [
    scooter.purchasePriceCents,
    scooter.additionalCostsCents,
    scooter.salePriceCents,
  ].join("|")
  const [lastSignature, setLastSignature] = useState(storedSignature)
  if (storedSignature !== lastSignature) {
    setLastSignature(storedSignature)
    setPurchase(centsToInput(scooter.purchasePriceCents))
    setAdditional(centsToInput(scooter.additionalCostsCents))
    setSale(centsToInput(scooter.salePriceCents))
  }

  const dirty =
    purchase !== centsToInput(scooter.purchasePriceCents) ||
    additional !== centsToInput(scooter.additionalCostsCents) ||
    sale !== centsToInput(scooter.salePriceCents)

  async function save() {
    setSaving(true)
    const result = await repositories.scooters.update(scooter.id, {
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
            <Button className="h-9 px-3.5" onClick={save} disabled={saving}>
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
          <p className="mt-4 rounded-lg border border-skope-gold/25 bg-skope-gold/6 px-3 py-2 text-xs text-foreground/85">
            Ungespeicherte Änderungen — auf {"\u201eSpeichern\u201c"} tippen,
            um sie zu übernehmen.
          </p>
        )}
      </PanelBody>
    </Panel>
  )
}
