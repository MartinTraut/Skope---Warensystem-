"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Pencil } from "lucide-react"

import { SaleBadge, WorkflowBadge } from "../badges"
import { EditScooterDialog } from "../edit-scooter-dialog"
import { MarkAsSoldDialog } from "../mark-as-sold-dialog"
import { TabChannels } from "./tab-channels"
import { TabImages } from "./tab-images"
import { TabInspection } from "./tab-inspection"
import { TabOverview } from "./tab-overview"
import { TabRefurbishment } from "./tab-refurbishment"
import { TabSale } from "./tab-sale"
import { ActivityList } from "@/components/dashboard/activity-feed"
import {
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/skope/primitives"
import { PanelSkeleton } from "@/components/skope/skeletons"
import { Button } from "@/components/ui/button"
import { useActivity, useHydrated, useScooter } from "@/hooks/use-cockpit"
import { getInspectionProgress } from "@/lib/domain/inspection"
import { modelLabel } from "@/lib/domain/status"
import type { Scooter } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

const TABS = [
  { key: "overview", label: "Übersicht" },
  { key: "inspection", label: "Prüfung" },
  { key: "refurbishment", label: "Aufbereitung" },
  { key: "images", label: "Bilder" },
  { key: "sale", label: "Verkauf" },
  { key: "channels", label: "Kanäle" },
  { key: "history", label: "Historie" },
] as const

type TabKey = (typeof TABS)[number]["key"]

/** Detailansicht eines Scooters — der Arbeitsplatz für Prüfung und Aufbereitung. */
export function ScooterDetailView({ scooterId }: { scooterId: string }) {
  const hydrated = useHydrated()
  const scooter = useScooter(scooterId)
  const [tab, setTab] = useState<TabKey>("overview")
  const [editOpen, setEditOpen] = useState(false)
  const [soldOpen, setSoldOpen] = useState(false)

  if (!hydrated) {
    return (
      <div className="space-y-6">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
    )
  }

  if (!scooter) {
    return (
      <Panel>
        <EmptyState
          title="Scooter nicht gefunden"
          description="Dieser Datensatz existiert nicht (mehr). Möglicherweise wurden die Demo-Daten zurückgesetzt."
          action={
            <Link
              href="/scooters"
              className="inline-flex h-10 items-center rounded-lg border border-skope-line-strong px-4 text-sm transition-colors hover:border-skope-gold/40 hover:text-skope-gold"
            >
              Zur Bestandsliste
            </Link>
          }
        />
      </Panel>
    )
  }

  const badgeFor = (key: TabKey) => tabBadge(key, scooter)

  return (
    <div className="space-y-6">
      <Link
        href="/scooters"
        className="inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-skope-gold/25 focus-visible:outline-none"
      >
        <ArrowLeft className="size-3.5" />
        Zurück zum Bestand
      </Link>

      {/* Kopf */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm text-skope-gold">
            {scooter.scooterNumber}
          </p>
          <h1 className="type-page-title mt-1 text-foreground">
            {modelLabel(scooter) || "Ohne Bezeichnung"}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <WorkflowBadge status={scooter.workflowStatus} />
            <SaleBadge status={scooter.saleStatus} />
            {scooter.serialNumber && (
              <span className="font-mono text-xs text-muted-foreground">
                {scooter.serialNumber}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="h-10 gap-2 px-4"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-4" />
            Bearbeiten
          </Button>
          {scooter.saleStatus !== "VERKAUFT" && (
            <>
              <Button
                variant="outline"
                className="h-10 px-4"
                onClick={() => setTab("channels")}
              >
                Veröffentlichen
              </Button>
              <Button className="h-10 px-4" onClick={() => setSoldOpen(true)}>
                Als verkauft markieren
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Reiter — horizontal scrollbar auf schmalen Viewports */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Bereiche"
          className="flex w-max min-w-full gap-1 border-b border-skope-line"
        >
          {TABS.map((entry) => {
            const active = tab === entry.key
            const badge = badgeFor(entry.key)
            return (
              <button
                key={entry.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(entry.key)}
                className={cn(
                  "relative flex h-11 items-center gap-2 px-3.5 text-sm whitespace-nowrap transition-colors duration-150",
                  "focus-visible:ring-3 focus-visible:ring-skope-gold/25 focus-visible:outline-none",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {entry.label}
                {badge !== null && (
                  <span
                    className={cn(
                      "grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-medium tabular-nums",
                      badge.tone === "error"
                        ? "bg-state-error/15 text-state-error"
                        : badge.tone === "warn"
                          ? "bg-state-warn/15 text-state-warn"
                          : "bg-white/8 text-muted-foreground"
                    )}
                  >
                    {badge.value}
                  </span>
                )}
                {active && (
                  <span
                    className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-skope-gold"
                    aria-hidden
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div key={tab} className="animate-rise">
        {tab === "overview" && <TabOverview scooter={scooter} />}
        {tab === "inspection" && <TabInspection scooter={scooter} />}
        {tab === "refurbishment" && <TabRefurbishment scooter={scooter} />}
        {tab === "images" && <TabImages scooter={scooter} />}
        {tab === "sale" && <TabSale scooter={scooter} />}
        {tab === "channels" && <TabChannels scooter={scooter} />}
        {tab === "history" && <HistoryTab scooter={scooter} />}
      </div>

      <EditScooterDialog
        scooter={scooter}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <MarkAsSoldDialog
        scooter={scooter}
        open={soldOpen}
        onOpenChange={setSoldOpen}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Historie                                                            */
/* ------------------------------------------------------------------ */

function HistoryTab({ scooter }: { scooter: Scooter }) {
  const activity = useActivity()
  const events = activity.filter((event) => event.scooterId === scooter.id)

  return (
    <Panel>
      <PanelHeader
        title="Historie"
        description="Alle Ereignisse zu diesem Scooter, neueste zuerst."
      />
      <PanelBody>
        {events.length === 0 ? (
          <EmptyState
            title="Noch keine Ereignisse"
            description="Sobald an diesem Scooter gearbeitet wird, entsteht hier ein lückenloses Protokoll."
          />
        ) : (
          <ActivityList events={events} />
        )}
      </PanelBody>
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* Zähler an den Reitern                                               */
/* ------------------------------------------------------------------ */

function tabBadge(
  key: TabKey,
  scooter: Scooter
): { value: number; tone: "error" | "warn" | "neutral" } | null {
  if (key === "inspection") {
    const progress = getInspectionProgress(scooter.inspection)
    if (progress.problems > 0) {
      return { value: progress.problems, tone: "error" }
    }
    if (!scooter.inspection.completedAt) {
      const open = progress.total - progress.checked
      return open > 0 ? { value: open, tone: "warn" } : null
    }
    return null
  }

  if (key === "refurbishment") {
    const open = scooter.repairs.filter((r) => r.status !== "ERLEDIGT").length
    return open > 0 ? { value: open, tone: "warn" } : null
  }

  if (key === "images") {
    return scooter.images.length > 0
      ? { value: scooter.images.length, tone: "neutral" }
      : null
  }

  if (key === "channels") {
    const failed = scooter.listings.filter((l) => l.status === "FEHLER").length
    if (failed > 0) return { value: failed, tone: "error" }
    const live = scooter.listings.filter(
      (l) => l.status === "VEROEFFENTLICHT"
    ).length
    return live > 0 ? { value: live, tone: "neutral" } : null
  }

  return null
}
