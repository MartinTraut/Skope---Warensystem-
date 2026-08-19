"use client"

import Link from "next/link"
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Inbox,
  Layers,
  Radio,
  TrendingUp,
  Upload,
  Wrench,
} from "lucide-react"

import { ActivityFeed } from "./activity-feed"
import { CapitalChart, OriginChart, RevenueChart } from "./charts"
import { IntegrationStatus } from "./integration-status"
import { ProcessPipeline } from "./process-pipeline"
import { InventoryTable } from "@/components/inventory/inventory-table"
import {
  EmptyState,
  Panel,
  PanelHeader,
  PageHeader,
} from "@/components/skope/primitives"
import { MetricGridSkeleton, TableSkeleton } from "@/components/skope/skeletons"
import { buttonVariants } from "@/components/ui/button"
import { articleLabel } from "@/lib/domain/article-factory"
import { formatCents, formatCentsCompact, formatNumber } from "@/lib/domain/money"
import {
  useArticleViews,
  useBelowReorderLevel,
  useDashboardMetrics,
  useHydrated,
  useOpenProposals,
  useSlowMovers,
} from "@/hooks/use-cockpit"
import { cn } from "@/lib/utils"
import { FOCUS_RING } from "@/components/skope/focus"

/**
 * Startseite des Cockpits.
 *
 * Der Aufbau folgt dem, was den Betrieb tatsächlich kostet: oben Umsatz und
 * Lagerwert, dann die Arbeit, die wartet — Freigaben, Nachbestellungen,
 * Ladenhüter. Das Lager ist das eigentliche Thema, nicht die Geräteliste.
 */
export function DashboardView() {
  const hydrated = useHydrated()
  const metrics = useDashboardMetrics()
  const views = useArticleViews()
  const openProposals = useOpenProposals()
  const belowReorder = useBelowReorderLevel()
  const slowMovers = useSlowMovers()

  const recent = [...views]
    .filter((view) => view.article.archivedAt === null)
    .sort((a, b) => b.article.updatedAt.localeCompare(a.article.updatedAt))
    .slice(0, 8)

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, Martin`}
        description="Lager, Aufbereitung und Kanäle auf einen Blick."
        actions={
          <>
            <Link
              href="/import"
              className={buttonVariants({
                variant: "outline",
                className: "h-10 gap-2 px-4",
              })}
            >
              <Upload className="size-4" />
              Import starten
            </Link>
            <Link
              href="/proposals"
              className={buttonVariants({ className: "h-10 gap-2 px-4" })}
            >
              <Inbox className="size-4" />
              {openProposals.length > 0
                ? `${openProposals.length} Freigaben`
                : "Freigaben"}
            </Link>
          </>
        }
      />

      {hydrated && metrics.failedSyncs > 0 && (
        <Link
          href="/integrations"
          className="flex animate-rise items-center gap-3 rounded-xl border border-state-error/25 bg-state-error/8 px-4 py-3 transition-colors hover:border-state-error/40 focus-visible:ring-3 focus-visible:ring-state-error/20 focus-visible:outline-none"
        >
          <AlertTriangle className="size-4 shrink-0 text-state-error" />
          <p className="min-w-0 flex-1 text-sm text-foreground">
            <span className="font-medium">
              {metrics.failedSyncs} fehlgeschlagene Übertragung
              {metrics.failedSyncs === 1 ? "" : "en"}
            </span>{" "}
            <span className="text-muted-foreground">
              — betroffene Kanäle sind nicht aktuell.
            </span>
          </p>
          <ArrowUpRight className="size-4 shrink-0 text-state-error" />
        </Link>
      )}

      {!hydrated ? (
        <MetricGridSkeleton />
      ) : (
        <div className="grid animate-rise gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <Panel accent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <p className="type-label">Umsatz diesen Monat</p>
              <TrendingUp className="size-4 shrink-0 text-skope-accent" aria-hidden />
            </div>
            <p className="type-display mt-3 text-skope-accent">
              {formatCentsCompact(metrics.revenueThisMonthCents)}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              aus {metrics.soldThisMonth} Verkäufen über alle Kanäle
            </p>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-skope-line pt-4">
              <div>
                <p className="type-label">Ø Marge</p>
                <p className="type-metric mt-1.5 text-foreground">
                  {formatCentsCompact(metrics.averageMarginCents)}
                </p>
              </div>
              <div>
                <p className="type-label">Lagerwert</p>
                <p className="type-metric mt-1.5 text-foreground">
                  {formatCentsCompact(metrics.stockValueCents)}
                </p>
              </div>
            </div>
            <p className="type-caption mt-3 text-muted-foreground">
              Operative Rechengröße, kein steuerlicher Gewinn.
            </p>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-y divide-skope-line sm:grid-cols-3">
              <StockCell
                label="Artikel"
                value={metrics.articleCount}
                hint={`${formatNumber(metrics.pieceCount)} Stück im Lager`}
                icon={<Layers className="size-4" />}
                tone="text-state-info"
                href="/inventory"
              />
              <StockCell
                label="Geräte im Bestand"
                value={metrics.unitsInStock}
                hint={`${metrics.inbound} im Wareneingang`}
                icon={<Boxes className="size-4" />}
                tone="text-state-info"
                href="/inventory?art=SERIALISIERT"
              />
              <StockCell
                label="Verkaufsbereit"
                value={metrics.readyForSale}
                hint="geprüft und freigegeben"
                icon={<CheckCircle2 className="size-4" />}
                tone="text-state-ready"
              />
              <StockCell
                label="In Aufbereitung"
                value={metrics.inRefurbishment}
                hint={`${metrics.inInspection} in Prüfung`}
                icon={<Wrench className="size-4" />}
                tone="text-state-warn"
                href="/refurbishment"
              />
              <StockCell
                label="Inseriert"
                value={metrics.listed}
                hint="mind. ein aktiver Kanal"
                icon={<Radio className="size-4" />}
                tone="text-state-live"
              />
              <StockCell
                label="Offene Freigaben"
                value={metrics.openProposals}
                hint="fertige Inserate, ein Klick"
                icon={<ClipboardList className="size-4" />}
                tone="text-skope-accent"
                href="/proposals"
              />
            </div>
          </Panel>
        </div>
      )}

      {hydrated && (
        <div className="grid animate-rise items-start gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <RevenueChart />
            <CapitalChart />
          </div>
          <OriginChart />
        </div>
      )}

      {hydrated && (belowReorder.length > 0 || slowMovers.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {belowReorder.length > 0 && (
            <Panel tone="warn" className="overflow-hidden">
              <PanelHeader
                tone="warn"
                title="Unter Meldebestand"
                description="Diese Artikel gehen zur Neige — nachbestellen oder aus einer Ausschlachtung auffüllen."
                icon={<AlertTriangle className="size-4" />}
              />
              <ul className="divide-y divide-skope-line">
                {belowReorder.slice(0, 6).map((view) => (
                  <li key={view.article.id}>
                    <Link
                      href={`/inventory/${view.article.id}`}
                      className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-sunken sm:px-5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-foreground">
                          {articleLabel(view.article)}
                        </span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {view.article.sku}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-mono text-sm text-state-warn tabular-nums">
                          {view.stock.quantity}
                        </span>
                        <span className="block type-caption text-muted-foreground">
                          von {view.stock.reorderLevel}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {slowMovers.length > 0 && (
            <Panel className="overflow-hidden">
              <PanelHeader
                title="Ladenhüter"
                description="Kapital, das im Regal steht. Je länger es liegt, desto teurer wird es."
              />
              <ul className="divide-y divide-skope-line">
                {slowMovers.slice(0, 6).map((entry) => (
                  <li key={`${entry.articleId}:${entry.unitId ?? "artikel"}`}>
                    <Link
                      href={
                        entry.unitId
                          ? `/units/${entry.unitId}`
                          : `/inventory/${entry.articleId}`
                      }
                      className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-sunken sm:px-5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-foreground">
                          {entry.label}
                        </span>
                        <span className="block type-caption text-muted-foreground">
                          {entry.days} Tage im Bestand
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-sm text-foreground tabular-nums">
                        {formatCents(entry.tiedCents)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      <ProcessPipeline />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Zuletzt bearbeitet"
            description="Artikel, an denen zuletzt etwas passiert ist."
            action={
              <Link
                href="/inventory"
                className={cn("inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-skope-accent", FOCUS_RING)}
              >
                Alle {metrics.articleCount}
                <ArrowUpRight className="size-3.5" />
              </Link>
            }
          />
          {!hydrated ? (
            <TableSkeleton rows={6} />
          ) : recent.length === 0 ? (
            <EmptyState
              title="Noch kein Bestand"
              description="Lege einen Artikel an oder importiere eine Lieferantenliste."
              action={
                <Link
                  href="/import"
                  className={buttonVariants({ className: "h-10 px-4" })}
                >
                  Lieferung importieren
                </Link>
              }
            />
          ) : (
            <InventoryTable views={recent} compact />
          )}
        </Panel>

        <div className="space-y-6">
          <IntegrationStatus />
          <ActivityFeed limit={7} />
        </div>
      </div>
    </div>
  )
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 11) return "Guten Morgen"
  if (hour < 18) return "Guten Tag"
  return "Guten Abend"
}

/**
 * Einzelne Bestandszahl im dichten Raster.
 *
 * Bewusst ohne eigene Kante und Fläche — die Zelle ist Teil eines Panels,
 * keine zweite Karte darin. Wo ein Ziel existiert, ist die Zelle zugleich der
 * Weg dorthin: Eine Zahl, die eine Arbeitsliste meint, soll man antippen
 * können.
 */
function StockCell({
  label,
  value,
  hint,
  icon,
  tone,
  href,
}: {
  label: string
  value: number
  hint: string
  icon: React.ReactNode
  tone: string
  href?: string
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="type-label">{label}</p>
        <span className={cn("shrink-0", tone)} aria-hidden>
          {icon}
        </span>
      </div>
      <p className="mt-2.5 text-2xl leading-none font-medium tabular-nums text-foreground">
        {formatNumber(value)}
      </p>
      <p className="type-caption mt-1.5 truncate text-muted-foreground">{hint}</p>
    </>
  )

  const className = cn(
    "group -mt-px -ml-px block p-4 transition-colors hover:bg-surface-sunken",
    FOCUS_RING
  )

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
