"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Store,
  Tag,
  Zap,
} from "lucide-react"

import { ListingBadge } from "../badges"
import {
  DemoTag,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/skope/primitives"
import { Button } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import { formatCents, formatDateTime } from "@/lib/domain/money"
import { CHANNEL_META, getListing, isReadyForSale } from "@/lib/domain/status"
import type { Channel, Listing, Scooter } from "@/lib/domain/types"

/**
 * Verkaufskanäle eines Scooters.
 *
 * Shopify läuft über einen Adapter mit simulierter API — inklusive Latenz,
 * Fehlerzustand und Wiederholung. Kleinanzeigen ist bewusst nur ein manuell
 * gepflegter Status, weil keine Schnittstelle bestätigt ist.
 */
export function TabChannels({ scooter }: { scooter: Scooter }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ShopifyCard scooter={scooter} />
      <KleinanzeigenCard scooter={scooter} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Shopify                                                             */
/* ------------------------------------------------------------------ */

function ShopifyCard({ scooter }: { scooter: Scooter }) {
  const [busy, setBusy] = useState<string | null>(null)
  const listing = getListing(scooter, "SHOPIFY")
  if (!listing) return null

  const published = listing.status === "VEROEFFENTLICHT"
  const failed = listing.status === "FEHLER"
  const sold = scooter.saleStatus === "VERKAUFT"
  const adapterName = "Shopify"
  /**
   * Nach dem Verkauf sollen alle Kanäle stillgelegt sein. Schlägt das fehl,
   * bleibt das Listing auf FEHLER oder VEROEFFENTLICHT stehen — dann muss die
   * Reparatur hier möglich sein, statt sich hinter einem Hinweistext zu
   * verstecken.
   */
  const stillActive =
    listing.status !== "DEAKTIVIERT" &&
    listing.status !== "NICHT_VEROEFFENTLICHT"
  const ready = isReadyForSale(scooter)

  async function run(
    action: "publish" | "update" | "deactivate" | "retry",
    label: string
  ) {
    setBusy(action)
    const result =
      action === "publish"
        ? await repositories.channels.publish(scooter.id, "SHOPIFY")
        : action === "update"
          ? await repositories.channels.update(scooter.id, "SHOPIFY")
          : action === "retry"
            ? await repositories.channels.retry(scooter.id, "SHOPIFY")
            : await repositories.channels.deactivate(scooter.id, "SHOPIFY")
    setBusy(null)

    if (!result.ok) {
      // Fehlgeschlagen heißt fehlgeschlagen — der Status steht jetzt auf FEHLER.
      toast.error(`${label} fehlgeschlagen`, {
        description: result.message,
        action: {
          label: "Erneut versuchen",
          onClick: () => run("retry", "Veröffentlichung"),
        },
      })
      return
    }
    toast.success(`${label} erfolgreich`, {
      description:
        action === "deactivate"
          ? "Bestand auf 0 gesetzt."
          : "Scooter erfolgreich auf Shopify veröffentlicht.",
    })
  }

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <Store className="size-4 text-muted-foreground" />
            Shopify
            <DemoTag />
          </span>
        }
        action={<ListingBadge status={listing.status} size="sm" />}
      />
      <PanelBody className="space-y-4">
        <ChannelFacts listing={listing} />

        {failed && listing.lastError && (
          <div className="flex gap-2.5 rounded-lg border border-state-error/28 bg-state-error/8 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-state-error" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-state-error">
                Letzter Versuch fehlgeschlagen
                {listing.retryCount > 0 && ` (${listing.retryCount}. Versuch)`}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                {listing.lastError}
              </p>
            </div>
          </div>
        )}

        {!ready && !published && !sold && (
          <p className="rounded-lg border border-state-warn/25 bg-state-warn/8 px-3 py-2.5 text-xs leading-relaxed text-foreground/85">
            Der Scooter erfüllt noch nicht alle Voraussetzungen für die
            Veröffentlichung. Die offenen Punkte stehen im Reiter{" "}
            {"\u201eÜbersicht\u201c"} unter Freigabe.
          </p>
        )}

        {sold ? (
          stillActive ? (
            /*
             * Der gefährlichste Zustand des Systems: verkauft, aber das
             * Angebot steht noch. Genau hier verschwand bisher jede
             * Schaltfläche — die Ware blieb kaufbar, obwohl sie weg war.
             */
            <div className="space-y-3">
              <div className="flex gap-2.5 rounded-lg border border-state-error/35 bg-state-error/10 p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-state-error" />
                <p className="text-xs leading-relaxed text-foreground/90">
                  Der Scooter ist verkauft, das Angebot auf {adapterName} ist
                  aber noch aktiv. Es besteht die Gefahr eines Doppelverkaufs.
                </p>
              </div>
              <Button
                variant="destructive"
                className="h-11 w-full px-4"
                disabled={busy !== null}
                onClick={() => run("deactivate", "Deaktivierung")}
              >
                {busy === "deactivate"
                  ? "Wird deaktiviert …"
                  : "Angebot jetzt deaktivieren"}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Der Scooter ist verkauft. Das Angebot wurde deaktiviert und der
              Bestand auf 0 gesetzt.
            </p>
          )
        ) : (
          <div className="flex flex-wrap gap-2">
            {!published && !failed && (
              <Button
                className="h-10 flex-1 px-4 sm:flex-none"
                disabled={busy !== null || !ready}
                onClick={() => run("publish", "Veröffentlichung")}
              >
                {busy === "publish" ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="size-4 animate-spin" />
                    Wird veröffentlicht …
                  </span>
                ) : (
                  "Auf Shopify veröffentlichen"
                )}
              </Button>
            )}

            {failed && (
              <Button
                className="h-10 flex-1 px-4 sm:flex-none"
                disabled={busy !== null}
                onClick={() => run("retry", "Veröffentlichung")}
              >
                {busy === "retry" ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="size-4 animate-spin" />
                    Erneuter Versuch …
                  </span>
                ) : (
                  "Erneut versuchen"
                )}
              </Button>
            )}

            {published && (
              <>
                <Button
                  variant="outline"
                  className="h-10 gap-2 px-4"
                  disabled={busy !== null}
                  onClick={() => run("update", "Aktualisierung")}
                >
                  <RefreshCw
                    className={
                      busy === "update" ? "size-4 animate-spin" : "size-4"
                    }
                  />
                  Aktualisieren
                </Button>
                <Button
                  variant="outline"
                  className="h-10 px-4"
                  disabled={busy !== null}
                  onClick={() => run("deactivate", "Deaktivierung")}
                >
                  Deaktivieren
                </Button>
              </>
            )}
          </div>
        )}

        {published && <SimulateOrderButton scooter={scooter} />}
      </PanelBody>
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* Kleinanzeigen                                                       */
/* ------------------------------------------------------------------ */

function KleinanzeigenCard({ scooter }: { scooter: Scooter }) {
  const [busy, setBusy] = useState(false)
  const listing = getListing(scooter, "KLEINANZEIGEN")
  if (!listing) return null

  const published = listing.status === "VEROEFFENTLICHT"
  const sold = scooter.saleStatus === "VERKAUFT"
  const stillActive =
    listing.status !== "DEAKTIVIERT" &&
    listing.status !== "NICHT_VEROEFFENTLICHT"

  async function toggle(next: "publish" | "deactivate") {
    setBusy(true)
    const result =
      next === "publish"
        ? await repositories.channels.publish(scooter.id, "KLEINANZEIGEN")
        : await repositories.channels.deactivate(scooter.id, "KLEINANZEIGEN")
    setBusy(false)

    if (!result.ok) {
      toast.error("Status nicht geändert", { description: result.message })
      return
    }
    toast.success(
      next === "publish" ? "Als inseriert markiert" : "Als entfernt markiert"
    )
  }

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <Tag className="size-4 text-muted-foreground" />
            Kleinanzeigen
            <DemoTag>Manuell</DemoTag>
          </span>
        }
        action={<ListingBadge status={listing.status} size="sm" />}
      />
      <PanelBody className="space-y-4">
        <p className="rounded-lg border border-skope-line bg-surface-sunken px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Für Kleinanzeigen ist derzeit <strong>keine Schnittstelle bestätigt</strong>.
          Das Cockpit führt hier ausschließlich den internen Status — die Anzeige
          selbst wird im Kleinanzeigen-Konto von Hand erstellt und entfernt.
          Der Verkauf wird trotzdem zentral erfasst.
        </p>

        <ChannelFacts listing={listing} manual />

        {sold ? (
          stillActive ? (
            <div className="space-y-3">
              <div className="flex gap-2.5 rounded-lg border border-state-warn/35 bg-state-warn/10 p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-state-warn" />
                <p className="text-xs leading-relaxed text-foreground/90">
                  Der Scooter ist verkauft, die Anzeige steht im Cockpit aber
                  noch auf aktiv. Bitte die Anzeige im Kleinanzeigen-Konto
                  entfernen und hier nachziehen.
                </p>
              </div>
              <Button
                variant="destructive"
                className="h-11 w-full px-4"
                disabled={busy}
                onClick={() => toggle("deactivate")}
              >
                Als entfernt markieren
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Der Scooter ist verkauft. Die Anzeige gilt als entfernt.
            </p>
          )
        ) : (
          <div className="flex flex-wrap gap-2">
            {published ? (
              <Button
                variant="outline"
                className="h-10 px-4"
                disabled={busy}
                onClick={() => toggle("deactivate")}
              >
                Als entfernt markieren
              </Button>
            ) : (
              <Button
                className="h-10 px-4"
                disabled={busy}
                onClick={() => toggle("publish")}
              >
                Als inseriert markieren
              </Button>
            )}
            <Button
              variant="ghost"
              className="h-10 gap-2 px-4 text-muted-foreground"
              disabled
              title="Ohne bestätigte Schnittstelle gibt es keine verlinkbare Anzeige."
            >
              <ExternalLink className="size-4" />
              Anzeige öffnen
            </Button>
          </div>
        )}
      </PanelBody>
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* Bausteine                                                           */
/* ------------------------------------------------------------------ */

function ChannelFacts({
  listing,
  manual,
}: {
  listing: Listing
  manual?: boolean
}) {
  const meta = CHANNEL_META[listing.channel as Channel]

  return (
    <dl className="space-y-2 text-sm">
      <Fact label="Preis" value={formatCents(listing.priceCents)} />
      <Fact
        label="Bestand"
        value={manual ? "—" : String(listing.inventory)}
      />
      <Fact
        label="Letzte Synchronisation"
        value={
          listing.lastSyncedAt ? formatDateTime(listing.lastSyncedAt) : "—"
        }
      />
      {!manual && listing.externalIds.productId && (
        <>
          <Fact
            label="Product ID"
            value={listing.externalIds.productId}
            mono
          />
          <Fact
            label="Variant ID"
            value={listing.externalIds.variantId ?? "—"}
            mono
          />
          <Fact
            label="Inventory Item ID"
            value={listing.externalIds.inventoryItemId ?? "—"}
            mono
          />
        </>
      )}
      {!meta.automated && (
        <p className="pt-1 type-caption text-muted-foreground">
          Kein automatischer Abgleich möglich.
        </p>
      )}
    </dl>
  )
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={
          "min-w-0 truncate text-right text-foreground " +
          (mono ? "font-mono text-xs" : "tabular-nums")
        }
      >
        {value}
      </dd>
    </div>
  )
}

/**
 * Demo-Auslöser für einen eingehenden Shopify-Verkauf.
 *
 * Klar als Demo gekennzeichnet und optisch abgesetzt — das ist kein
 * regulärer Arbeitsschritt, sondern dient der Vorführung des späteren
 * Webhook-Ablaufs.
 */
function SimulateOrderButton({ scooter }: { scooter: Scooter }) {
  const [busy, setBusy] = useState(false)

  async function simulate() {
    setBusy(true)
    const result = await repositories.demo.simulateShopifyOrder(scooter.id)
    setBusy(false)

    if (!result.ok) {
      toast.error("Simulation nicht möglich", { description: result.message })
      return
    }

    // Der Verkauf ist verbucht — das Reporting kann trotzdem gescheitert
    // sein. Beides getrennt melden, statt pauschal Erfolg zu behaupten.
    if (result.data.sheetsSyncStatus === "FEHLER") {
      toast.warning("Verkauf verbucht, Reporting fehlgeschlagen", {
        description:
          `Scooter auf VERKAUFT, Bestand 0, Kanäle deaktiviert. ` +
          `Die Umsatzzeile wurde nicht geschrieben: ${result.data.sheetsError ?? "unbekannter Fehler"}`,
      })
      return
    }

    toast.success("Shopify-Bestellung verarbeitet", {
      description:
        "Scooter auf VERKAUFT, Bestand 0, Kanäle deaktiviert, Reporting synchronisiert.",
    })
  }

  return (
    <div className="mt-1 rounded-lg border border-dashed border-skope-gold/30 bg-skope-gold/4 p-3.5">
      <div className="flex items-start gap-2.5">
        <Zap className="mt-0.5 size-4 shrink-0 text-skope-gold" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-foreground">
            Shopify-Verkauf simulieren
            <DemoTag>Nur Demo</DemoTag>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Löst den Ablauf aus, den später der echte Bestell-Webhook auslöst.
          </p>
          <Button
            variant="outline"
            className="mt-3 h-9 px-3.5"
            disabled={busy}
            onClick={simulate}
          >
            {busy ? "Wird verarbeitet …" : "Bestellung simulieren"}
          </Button>
        </div>
      </div>
    </div>
  )
}
