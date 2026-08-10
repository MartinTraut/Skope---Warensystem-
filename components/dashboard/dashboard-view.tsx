"use client"

import { useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Coins,
  Plus,
  Radio,
  ShoppingBag,
  TrendingUp,
  Upload,
  Wrench,
} from "lucide-react"

import { ActivityFeed } from "./activity-feed"
import { IntegrationStatus } from "./integration-status"
import { ProcessPipeline } from "./process-pipeline"
import { NewScooterDialog } from "@/components/scooters/new-scooter-dialog"
import { ScooterTable } from "@/components/scooters/scooter-table"
import {
  Metric,
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
        <div className="grid animate-rise grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <Metric
            label="Scooter im Bestand"
            value={metrics.inStock}
            hint={`${metrics.inbound} neu im Wareneingang`}
            icon={<Boxes className="size-4" />}
          />
          <Metric
            label="Verkaufsbereit"
            value={metrics.readyForSale}
            hint="geprüft und freigegeben"
            icon={<CheckCircle2 className="size-4" />}
          />
          <Metric
            label="In Aufbereitung"
            value={metrics.inRefurbishment}
            hint={`${metrics.inInspection} zusätzlich in Prüfung`}
            icon={<Wrench className="size-4" />}
          />
          <Metric
            label="Inseriert"
            value={metrics.listed}
            hint="mindestens ein aktiver Kanal"
            icon={<Radio className="size-4" />}
          />
          <Metric
            label="Reserviert"
            value={metrics.reserved}
            hint="für Interessenten vorgemerkt"
            icon={<ClipboardList className="size-4" />}
          />
          <Metric
            label="Verkauft diesen Monat"
            value={metrics.soldThisMonth}
            hint="über alle Kanäle"
            icon={<ShoppingBag className="size-4" />}
          />
          <Metric
            label="Umsatz diesen Monat"
            value={formatCentsCompact(metrics.revenueThisMonthCents)}
            hint="Summe der Verkaufspreise"
            icon={<TrendingUp className="size-4" />}
            accent
          />
          <Metric
            label="Ø Marge"
            value={formatCentsCompact(metrics.averageMarginCents)}
            hint="operativ, ohne Steuerbetrachtung"
            icon={<Coins className="size-4" />}
          />
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
                className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-skope-gold focus-visible:ring-3 focus-visible:ring-skope-gold/25 focus-visible:outline-none"
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
