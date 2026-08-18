"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Pencil } from "lucide-react"

import { SaleBadge, WorkflowBadge } from "@/components/shared/badges"
import { EditUnitDialog } from "../edit-unit-dialog"
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
import {
  useActivity,
  useArticle,
  useHydrated,
  useUnit,
} from "@/hooks/use-cockpit"
import { getInspectionProgress } from "@/lib/domain/inspection"
import { unitLabel } from "@/lib/domain/article-factory"
import type { ArticleUnit } from "@/lib/domain/types"
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
export function UnitDetailView({ unitId }: { unitId: string }) {
  const hydrated = useHydrated()
  const unit = useUnit(unitId)
  const article = useArticle(unit?.articleId)
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

  if (!unit) {
    return (
      <Panel>
        <EmptyState
          title="Gerät nicht gefunden"
          description="Dieser Datensatz existiert nicht (mehr). Möglicherweise wurden die Demo-Daten zurückgesetzt."
          action={
            <Link
              href="/units"
              className="inline-flex h-10 items-center rounded-lg border border-skope-line-strong px-4 text-sm transition-colors hover:border-skope-accent/40 hover:text-skope-accent"
            >
              Zum Bestand
            </Link>
          }
        />
      </Panel>
    )
  }

  const badgeFor = (key: TabKey) => tabBadge(key, unit)

  return (
    <div className="space-y-6">
      <Link
        href="/units"
        className="inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-skope-accent/25 focus-visible:outline-none"
      >
        <ArrowLeft className="size-3.5" />
        Zurück zum Bestand
      </Link>

      {/* Kopf */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm text-skope-accent">
            {unit.unitNumber}
          </p>
          <h1 className="type-page-title mt-1 text-foreground">
            {article ? unitLabel(article, unit) : "Ohne Bezeichnung"}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <WorkflowBadge status={unit.workflowStatus} />
            <SaleBadge status={unit.saleStatus} />
            {unit.serialNumber && (
              <span className="font-mono text-xs text-muted-foreground">
                {unit.serialNumber}
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
          {unit.saleStatus !== "VERKAUFT" && (
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
                  "focus-visible:ring-3 focus-visible:ring-skope-accent/25 focus-visible:outline-none",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {entry.label}
                {badge !== null && (
                  <span
                    className={cn(
                      "grid h-4 min-w-4 place-items-center rounded-full px-1 text-[11px] font-medium tabular-nums",
                      badge.tone === "error"
                        ? "bg-state-error/15 text-state-error"
                        : badge.tone === "warn"
                          ? "bg-state-warn/15 text-state-warn"
                          : "bg-surface-track text-muted-foreground"
                    )}
                  >
                    {badge.value}
                  </span>
                )}
                {active && (
                  <span
                    className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-skope-accent"
                    aria-hidden
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div key={tab} className="animate-rise">
        {tab === "overview" && <TabOverview unit={unit} />}
        {tab === "inspection" && <TabInspection unit={unit} />}
        {tab === "refurbishment" && <TabRefurbishment unit={unit} />}
        {tab === "images" && <TabImages unit={unit} />}
        {tab === "sale" && <TabSale unit={unit} />}
        {tab === "channels" && <TabChannels unit={unit} />}
        {tab === "history" && <HistoryTab unit={unit} />}
      </div>

      <EditUnitDialog
        unit={unit}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <MarkAsSoldDialog
        unit={unit}
        open={soldOpen}
        onOpenChange={setSoldOpen}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Historie                                                            */
/* ------------------------------------------------------------------ */

function HistoryTab({ unit }: { unit: ArticleUnit }) {
  const activity = useActivity()
  const events = activity.filter((event) => event.unitId === unit.id)

  return (
    <Panel>
      <PanelHeader
        title="Historie"
        description="Alle Ereignisse zu diesem Gerät, neueste zuerst."
      />
      <PanelBody>
        {events.length === 0 ? (
          <EmptyState
            title="Noch keine Ereignisse"
            description="Sobald an diesem Gerät gearbeitet wird, entsteht hier ein lückenloses Protokoll."
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
  unit: ArticleUnit
): { value: number; tone: "error" | "warn" | "neutral" } | null {
  if (key === "inspection") {
    const progress = getInspectionProgress(unit.inspection)
    if (progress.problems > 0) {
      return { value: progress.problems, tone: "error" }
    }
    if (!unit.inspection.completedAt) {
      const open = progress.total - progress.checked
      return open > 0 ? { value: open, tone: "warn" } : null
    }
    return null
  }

  if (key === "refurbishment") {
    const open = unit.repairs.filter((r) => r.status !== "ERLEDIGT").length
    return open > 0 ? { value: open, tone: "warn" } : null
  }

  if (key === "images") {
    return unit.images.length > 0
      ? { value: unit.images.length, tone: "neutral" }
      : null
  }

  if (key === "channels") {
    const failed = unit.listings.filter((l) => l.status === "FEHLER").length
    if (failed > 0) return { value: failed, tone: "error" }
    const live = unit.listings.filter(
      (l) => l.status === "VEROEFFENTLICHT"
    ).length
    return live > 0 ? { value: live, tone: "neutral" } : null
  }

  return null
}
