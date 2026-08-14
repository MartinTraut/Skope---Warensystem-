"use client"

import Link from "next/link"
import { toast } from "sonner"
import {
  AlertTriangle,
  Database,
  FileSpreadsheet,
  Store,
  Tag,
  type LucideIcon,
} from "lucide-react"

import { StatusPill } from "@/components/skope/status-pill"
import { ToggleRow } from "@/components/skope/form"
import {
  DemoTag,
  Panel,
  PanelBody,
  PanelHeader,
  PageHeader,
} from "@/components/skope/primitives"
import { buttonVariants } from "@/components/ui/button"
import type { StatusTone } from "@/lib/domain/status"
import { DateTimeText } from "@/components/skope/client-time"
import { repositories } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import { useIntegrationState, useSales, useScooters } from "@/hooks/use-cockpit"

/**
 * Übersicht der angebundenen Systeme.
 *
 * Jede Karte sagt ehrlich, was heute passiert und was für den Produktivbetrieb
 * noch fehlt. Zusätzlich lassen sich hier Fehlerfälle für Vorführungen
 * gezielt auslösen.
 */
export function IntegrationsView() {
  const integrations = useIntegrationState()
  const scooters = useScooters()
  const sales = useSales()

  const failedListings = scooters.filter((scooter) =>
    scooter.listings.some((listing) => listing.status === "FEHLER")
  ).length
  const failedSheets = sales.filter(
    (sale) => sale.sheetsSyncStatus === "FEHLER"
  ).length

  const publishedCount = scooters.filter((scooter) =>
    scooter.listings.some(
      (listing) =>
        listing.channel === "SHOPIFY" && listing.status === "VEROEFFENTLICHT"
    )
  ).length
  const kleinanzeigenCount = scooters.filter((scooter) =>
    scooter.listings.some(
      (listing) =>
        listing.channel === "KLEINANZEIGEN" &&
        listing.status === "VEROEFFENTLICHT"
    )
  ).length
  const syncedSales = sales.filter(
    (sale) => sale.sheetsSyncStatus === "SYNCHRONISIERT"
  ).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrationen"
        description="Zustand der angebundenen Systeme. Im Prototyp laufen alle externen Aufrufe gegen Demo-Adapter."
      />

      <div className="flex items-start gap-3 rounded-xl border border-skope-accent/25 bg-skope-accent/6 px-4 py-3.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-skope-accent" />
        <p className="text-sm leading-relaxed text-foreground/85">
          <span className="font-medium">Alle Integrationen laufen im Demo-Modus.</span>{" "}
          Es werden keine Daten an Shopify, Kleinanzeigen oder Google gesendet.
          Die Abläufe, Fehlerzustände und Wiederholungen entsprechen aber dem,
          was später produktiv passiert.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <IntegrationCard
          icon={Database}
          name="Avides"
          status="Import bereit"
          tone="info"
          summary="Generischer CSV-Import mit frei konfigurierbarem Spalten-Mapping."
          facts={[
            { label: "Format", value: "CSV / TSV (clientseitig)" },
            { label: "XLSX", value: "kommt mit der echten Anbindung" },
            { label: "Dublettenprüfung", value: "über Seriennummer" },
          ]}
          missing="Eine echte Avides-Exportdatei, um das Standard-Mapping festzulegen. Es sind bewusst keine Spaltennamen fest verdrahtet."
          action={{ href: "/import", label: "Import öffnen" }}
        />

        <IntegrationCard
          icon={Store}
          name="Shopify"
          status={integrations.simulateShopifyError ? "Fehler simuliert" : "Demo-Adapter aktiv"}
          tone={integrations.simulateShopifyError ? "error" : "progress"}
          summary="Veröffentlichen, Aktualisieren und Deaktivieren laufen über den MockShopifyAdapter — inklusive Latenz und Idempotenz über gespeicherte IDs."
          facts={[
            { label: "Aktive Angebote", value: String(publishedCount) },
            {
              label: "Fehlerhafte Listings",
              value: String(failedListings),
              tone: failedListings > 0 ? "error" : undefined,
            },
            {
              label: "Letzte Übertragung",
              value: <DateTimeText iso={integrations.shopifyLastSyncAt} />,
            },
          ]}
          missing="Custom App mit Admin-API-Token, Webhook-Secret und ein separater Development Store zum Testen. Die Anbindung erfolgt über die aktuelle GraphQL Admin API."
        />

        <IntegrationCard
          icon={Tag}
          name="Kleinanzeigen"
          status="Manuell"
          tone="neutral"
          summary="Kein automatisierter Kanal. Das Cockpit führt ausschließlich den internen Inseratsstatus, den ein Mitarbeiter setzt."
          facts={[
            { label: "Als inseriert markiert", value: String(kleinanzeigenCount) },
            { label: "Automatischer Abgleich", value: "nicht verfügbar" },
          ]}
          missing="Discovery: Ist über euren Händler-Account eine Import-/Feed-Schnittstelle für diese Warengruppe möglich? Bis das geklärt ist, wird bewusst keine Automatisierung vorgetäuscht."
        />

        <IntegrationCard
          icon={FileSpreadsheet}
          name="Google Sheets"
          status={integrations.simulateSheetsError ? "Fehler simuliert" : "Demo-Adapter aktiv"}
          tone={integrations.simulateSheetsError ? "error" : "progress"}
          summary="Nach jedem Verkauf wird eine Zeile in die Umsatztabelle geschrieben. Über die Verkaufs-ID idempotent, damit keine Doppelzeilen entstehen."
          facts={[
            { label: "Synchronisierte Verkäufe", value: String(syncedSales) },
            {
              label: "Fehlgeschlagen",
              value: String(failedSheets),
              tone: failedSheets > 0 ? "error" : undefined,
            },
            {
              label: "Letzter Abgleich",
              value: <DateTimeText iso={integrations.sheetsLastSyncAt} />,
            },
          ]}
          missing="Google Service Account (JSON) und die Freigabe der Zieltabelle für dessen E-Mail-Adresse. Außerdem die endgültige Spaltenstruktur der Tabelle."
          action={
            failedSheets > 0
              ? { href: "/sales", label: "Fehlgeschlagene Verkäufe" }
              : undefined
          }
        />
      </div>

      {/* Fehlersimulation */}
      <Panel>
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              Fehlerfälle simulieren
              <DemoTag>Nur Demo</DemoTag>
            </span>
          }
          description="Zum Vorführen, wie das System mit Ausfällen externer Systeme umgeht."
        />
        <PanelBody className="space-y-2">
          <ToggleRow
            label="Shopify-Fehler simulieren"
            description="Veröffentlichen, Aktualisieren und Deaktivieren schlagen fehl. Das Listing geht sichtbar auf FEHLER und lässt sich wiederholen."
            checked={integrations.simulateShopifyError}
            onCheckedChange={async (checked) => {
              /*
                Ausgerechnet die Karte, die von ehrlicher Fehlermeldung
                handelt, verwarf ihr eigenes Ergebnis per `void` und meldete
                blind Erfolg: Schlug das Schreiben fehl, sprang der Schalter
                zurück, während der Toast das Gegenteil behauptete.
              */
              const result = await runAction(
                repositories.settings.setIntegrationFlags({
                  simulateShopifyError: checked,
                }),
                { failure: "Einstellung nicht geändert" }
              )
              if (result === null) return
              toast[checked ? "warning" : "success"](
                checked
                  ? "Shopify-Fehlersimulation aktiv"
                  : "Shopify-Fehlersimulation deaktiviert"
              )
            }}
          />
          <ToggleRow
            label="Google-Sheets-Fehler simulieren"
            description="Verkaufszeilen werden nicht geschrieben. Der Verkauf bleibt trotzdem korrekt verbucht — nur das Reporting steht auf FEHLER."
            checked={integrations.simulateSheetsError}
            onCheckedChange={async (checked) => {
              const result = await runAction(
                repositories.settings.setIntegrationFlags({
                  simulateSheetsError: checked,
                }),
                { failure: "Einstellung nicht geändert" }
              )
              if (result === null) return
              toast[checked ? "warning" : "success"](
                checked
                  ? "Sheets-Fehlersimulation aktiv"
                  : "Sheets-Fehlersimulation deaktiviert"
              )
            }}
          />

          <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
            Grundregel des Systems: Eine externe Aktion wird nie als erfolgreich
            dargestellt, wenn sie fehlgeschlagen ist. Der betroffene Kanal
            bekommt einen Fehlerstatus mit Meldung, Zeitpunkt und Anzahl der
            Versuche.
          </p>
        </PanelBody>
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Karte                                                               */
/* ------------------------------------------------------------------ */

interface Fact {
  label: string
  value: React.ReactNode
  tone?: "error"
}

function IntegrationCard({
  icon: Icon,
  name,
  status,
  tone,
  summary,
  facts,
  missing,
  action,
}: {
  icon: LucideIcon
  name: string
  status: string
  tone: StatusTone
  summary: string
  facts: Fact[]
  missing: string
  action?: { href: string; label: string }
}) {
  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <Icon className="size-4 text-muted-foreground" />
            {name}
          </span>
        }
        action={<StatusPill tone={tone}>{status}</StatusPill>}
      />
      <PanelBody className="flex flex-1 flex-col gap-4">
        <p className="text-sm leading-relaxed text-foreground/85">{summary}</p>

        <dl className="space-y-1.5 text-sm">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="flex items-baseline justify-between gap-4"
            >
              <dt className="text-muted-foreground">{fact.label}</dt>
              <dd
                className={
                  "text-right tabular-nums " +
                  (fact.tone === "error"
                    ? "font-medium text-state-error"
                    : "text-foreground")
                }
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-auto rounded-lg border border-skope-line bg-surface-sunken p-3">
          <p className="type-label">Für den Produktivbetrieb nötig</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {missing}
          </p>
        </div>

        {action && (
          <Link
            href={action.href}
            className={buttonVariants({
              variant: "outline",
              className: "h-10 w-full px-4",
            })}
          >
            {action.label}
          </Link>
        )}
      </PanelBody>
    </Panel>
  )
}
