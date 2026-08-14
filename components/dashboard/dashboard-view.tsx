"use client"

import { useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Plus,
  Radio,
  ShoppingBag,
  TrendingUp,
  Upload,
  Wrench,
} from "lucide-react"

import { ActivityFeed } from "./activity-feed"
import { CapitalChart, OriginChart, RevenueChart } from "./charts"
import { IntegrationStatus } from "./integration-status"
import { ProcessPipeline } from "./process-pipeline"
import { NewScooterDialog } from "@/components/scooters/new-scooter-dialog"
import { ScooterTable } from "@/components/scooters/scooter-table"
import {
  Panel,
  PanelHeader,
  PageHeader,
} from "@/components/skope/primitives"
import { MetricGridSkeleton, TableSkeleton } from "@/components/skope/skeletons"
import { Button, buttonVariants } from "@/components/ui/button"
import { formatCentsCompact } from "@/lib/domain/money"
import {
  useDashboardMetrics,
  useHydrated,
  useScooters,
} from "@/hooks/use-cockpit"
import { isInStock } from "@/lib/domain/status"
import { cn } from "@/lib/utils"

/** Startseite des Cockpits: Zustand des Betriebs auf einen Blick. */
export function DashboardView() {
  const hydrated = useHydrated()
  const metrics = useDashboardMetrics()
  const scooters = useScooters()
  const [createOpen, setCreateOpen] = useState(false)

  // Zuletzt bearbeitete Geräte aus dem aktiven Bestand.
  const recent = [...scooters]
    .filter(isInStock)
    .sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .slice(0, 8)

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, Martin`}
        description="Hier ist der aktuelle Überblick über deinen SKOPE-Bestand."
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
            <Button className="h-10 gap-2 px-4" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Scooter hinzufügen
            </Button>
          </>
        }
      />

      {/* Warnleiste nur, wenn es wirklich etwas zu tun gibt. */}
      {hydrated && metrics.failedSyncs > 0 && (
        <Link
          href="/integrations"
          className="flex animate-rise items-center gap-3 rounded-xl border border-state-error/25 bg-state-error/8 px-4 py-3 transition-colors hover:border-state-error/40 focus-visible:ring-3 focus-visible:ring-state-error/20 focus-visible:outline-none"
        >
          <AlertTriangle className="size-4 shrink-0 text-state-error" />
          <p className="min-w-0 flex-1 text-sm text-foreground">
            <span className="font-medium">
              {metrics.failedSyncs} fehlgeschlagene Synchronisation
              {metrics.failedSyncs === 1 ? "" : "en"}
            </span>{" "}
            <span className="text-muted-foreground">
              — betroffene Kanäle sind nicht aktuell.
            </span>
          </p>
          <ArrowUpRight className="size-4 shrink-0 text-state-error" />
        </Link>
      )}

      {/* Kennzahlen */}
      {!hydrated ? (
        <MetricGridSkeleton />
      ) : (
        <div className="grid animate-rise gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          {/*
            Führungszone: Umsatz und Marge tragen die Entscheidung und
            bekommen deshalb Fläche und die große Displaygröße. Vorher standen
            acht gleich große Kacheln nebeneinander — ein Kartenfriedhof ohne
            Aussage darüber, worauf zuerst zu schauen ist.
          */}
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

            <div className="mt-5 flex items-end justify-between gap-4 border-t border-skope-line pt-4">
              <div>
                <p className="type-label">Ø Marge</p>
                <p className="type-metric mt-1.5 text-foreground">
                  {formatCentsCompact(metrics.averageMarginCents)}
                </p>
              </div>
              <p className="type-caption max-w-[14rem] text-right text-muted-foreground">
                Operative Rechengröße, kein steuerlicher Gewinn.
              </p>
            </div>
          </Panel>

          {/*
            Bestandszahlen als dichtes Raster in einem gemeinsamen Panel statt
            als sechs Einzelkarten — die Trennlinien reichen als Gliederung.
          */}
          <Panel className="overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-y divide-skope-line sm:grid-cols-3">
              <StockCell
                label="Im Bestand"
                value={metrics.inStock}
                hint={`${metrics.inbound} im Wareneingang`}
                icon={<Boxes className="size-4" />}
                tone="text-state-info"
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
              />
              <StockCell
                label="Inseriert"
                value={metrics.listed}
                hint="mind. ein aktiver Kanal"
                icon={<Radio className="size-4" />}
                tone="text-state-live"
              />
              <StockCell
                label="Reserviert"
                value={metrics.reserved}
                hint="für Interessenten"
                icon={<ClipboardList className="size-4" />}
                tone="text-state-done"
              />
              <StockCell
                label="Verkauft im Monat"
                value={metrics.soldThisMonth}
                hint="alle Kanäle"
                icon={<ShoppingBag className="size-4" />}
                tone="text-skope-accent"
              />
            </div>
          </Panel>
        </div>
      )}

      {/*
        Auswertung: Verlauf und Verteilung. Die Kacheln darüber sagen, wie es
        gerade steht — hier steht, wie es dahin kam und woraus der Umsatz
        besteht.
      */}
      {hydrated && (
        <div className="grid animate-rise items-start gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
          {/* Links die Geldthemen gestapelt, rechts die Herkunft am Stück. */}
          <div className="space-y-6">
            <RevenueChart />
            <CapitalChart />
          </div>
          <OriginChart />
        </div>
      )}

      <ProcessPipeline />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Aktuelle Scooter"
            description="Zuletzt bearbeitete Geräte aus dem aktiven Bestand."
            action={
              <Link
                href="/scooters"
                className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-skope-accent focus-visible:ring-3 focus-visible:ring-skope-accent/25 focus-visible:outline-none"
              >
                Alle {metrics.inStock}
                <ArrowUpRight className="size-3.5" />
              </Link>
            }
          />
          {!hydrated ? (
            <TableSkeleton rows={6} />
          ) : (
            <ScooterTable
              scooters={recent}
              variant="compact"
              emptyTitle="Kein aktiver Bestand"
              emptyDescription="Lege einen Scooter an oder importiere eine Lieferantenliste."
              emptyAction={
                <Button className="h-10 px-4" onClick={() => setCreateOpen(true)}>
                  Scooter hinzufügen
                </Button>
              }
            />
          )}
        </Panel>

        <div className="space-y-6">
          <IntegrationStatus />
          <ActivityFeed limit={7} />
        </div>
      </div>

      <NewScooterDialog open={createOpen} onOpenChange={setCreateOpen} />
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
 * keine zweite Karte darin. Die Farbe des Symbols ist dieselbe wie im
 * Statusabzeichen der jeweiligen Stufe: Wer „grün" gelernt hat, findet
 * „verkaufsbereit" ohne zu lesen.
 */
function StockCell({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string
  value: number
  hint: string
  icon: React.ReactNode
  tone: string
}) {
  return (
    <div className="group -mt-px -ml-px p-4 transition-colors hover:bg-surface-sunken">
      <div className="flex items-start justify-between gap-2">
        <p className="type-label">{label}</p>
        <span className={cn("shrink-0", tone)} aria-hidden>
          {icon}
        </span>
      </div>
      <p className="mt-2.5 text-2xl leading-none font-medium tabular-nums text-foreground">
        {value}
      </p>
      <p className="type-caption mt-1.5 truncate text-muted-foreground">{hint}</p>
    </div>
  )
}
