"use client"

import Link from "next/link"
import { ArrowUpRight, Database, FileSpreadsheet, Store, Tag } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Panel, PanelBody, PanelHeader, DemoTag } from "@/components/skope/primitives"
import { StatusPill } from "@/components/skope/status-pill"
import type { StatusTone } from "@/lib/domain/status"
import { RelativeTime } from "@/components/skope/client-time"
import { useIntegrationState } from "@/hooks/use-cockpit"

/**
 * Zustand der angebundenen Systeme.
 *
 * Wichtig: Kein Kanal wird als "verbunden" dargestellt, wenn dahinter nur ein
 * Demo-Adapter steht. Die Statuszeile sagt jeweils, was tatsächlich passiert.
 */

interface IntegrationRow {
  key: string
  name: string
  icon: LucideIcon
  status: string
  tone: StatusTone
  detail: React.ReactNode
}

export function IntegrationStatus() {
  const integrations = useIntegrationState()

  const rows: IntegrationRow[] = [
    {
      key: "avides",
      name: "Avides",
      icon: Database,
      status: "Import bereit",
      tone: "info",
      detail: "Generischer CSV-Import aktiv, Spalten-Mapping frei konfigurierbar.",
    },
    {
      key: "shopify",
      name: "Shopify",
      icon: Store,
      status: integrations.simulateShopifyError ? "Fehler simuliert" : "Demo-Adapter",
      tone: integrations.simulateShopifyError ? "error" : "progress",
      detail: integrations.simulateShopifyError ? (
        "Fehlersimulation ist aktiv — Veröffentlichungen schlagen bewusst fehl."
      ) : (
        <>
          Letzte Übertragung <RelativeTime iso={integrations.shopifyLastSyncAt} />.
        </>
      ),
    },
    {
      key: "kleinanzeigen",
      name: "Kleinanzeigen",
      icon: Tag,
      status: "Manuell",
      tone: "neutral",
      detail: "Keine Schnittstelle bestätigt — Status wird von Hand gepflegt.",
    },
    {
      key: "sheets",
      name: "Google Sheets",
      icon: FileSpreadsheet,
      status: integrations.simulateSheetsError ? "Fehler simuliert" : "Demo-Adapter",
      tone: integrations.simulateSheetsError ? "error" : "progress",
      detail: integrations.simulateSheetsError ? (
        "Fehlersimulation ist aktiv — Verkaufszeilen werden nicht geschrieben."
      ) : (
        <>
          Letzter Abgleich <RelativeTime iso={integrations.sheetsLastSyncAt} />.
        </>
      ),
    },
  ]

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            Synchronisation
            <DemoTag />
          </span>
        }
        action={
          <Link
            href="/integrations"
            className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-skope-gold focus-visible:ring-3 focus-visible:ring-skope-gold/25 focus-visible:outline-none"
          >
            Verwalten
            <ArrowUpRight className="size-3.5" />
          </Link>
        }
      />
      <PanelBody className="space-y-2 p-3 sm:p-3">
        {rows.map((row) => {
          const Icon = row.icon
          return (
            <div
              key={row.key}
              className="flex items-start gap-3 rounded-lg border border-transparent px-2.5 py-2.5 transition-colors hover:border-skope-line hover:bg-surface-sunken"
            >
              <span
                className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-skope-line bg-surface-sunken text-muted-foreground"
                aria-hidden
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{row.name}</p>
                  <StatusPill tone={row.tone} size="sm">
                    {row.status}
                  </StatusPill>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {row.detail}
                </p>
              </div>
            </div>
          )
        })}
      </PanelBody>
    </Panel>
  )
}
