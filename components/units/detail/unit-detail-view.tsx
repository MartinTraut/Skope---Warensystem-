"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Pencil } from "lucide-react"

import { SaleBadge, WorkflowBadge } from "@/components/shared/badges"
import { EditUnitDialog } from "../edit-unit-dialog"
import { MarkAsSoldDialog } from "../mark-as-sold-dialog"
import { WriteOffDialog } from "../write-off-dialog"
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
import { FOCUS_RING } from "@/components/skope/focus"
import { Button } from "@/components/ui/button"
import {
  useActivity,
  useArticle,
  useHydrated,
  useUnit,
} from "@/hooks/use-cockpit"
import { getInspectionProgress } from "@/lib/domain/inspection"
import { unitLabel } from "@/lib/domain/article-factory"
import { TabBar, type TabBadge } from "@/components/skope/tab-bar"
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
  const [writeOffOpen, setWriteOffOpen] = useState(false)

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
              href="/inventory"
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
        href="/inventory"
        className={cn("inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground", FOCUS_RING)}
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
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-4" />
            Bearbeiten
          </Button>
          {unit.saleStatus !== "VERKAUFT" && (
            <>
              <Button
                variant="outline"
                onClick={() => setTab("channels")}
              >
                Veröffentlichen
              </Button>
              {/*
                Nicht jedes Gerät verlässt den Bestand über die Kasse.
                Ohne diesen Weg blieb ein gestohlener Scooter im Lagerwert
                stehen oder wurde als Verkauf über 0 € gebucht.
              */}
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-state-error"
                onClick={() => setWriteOffOpen(true)}
              >
                Ausbuchen
              </Button>
              <Button onClick={() => setSoldOpen(true)}>
                Als verkauft markieren
              </Button>
            </>
          )}
        </div>
      </header>

      <TabBar
        items={TABS.map((entry) => ({ ...entry, badge: badgeFor(entry.key) }))}
        value={tab}
        onChange={setTab}
        idPrefix="unit"
      />

      <div
        key={tab}
        id={`unit-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`unit-tab-${tab}`}
        className="animate-rise"
      >
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
      <WriteOffDialog
        unit={unit}
        open={writeOffOpen}
        onOpenChange={setWriteOffOpen}
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

function tabBadge(key: TabKey, unit: ArticleUnit): TabBadge | null {
  if (key === "inspection") {
    const progress = getInspectionProgress(unit.inspection)
    if (progress.problems > 0) {
      return {
        value: progress.problems,
        tone: "error",
        srLabel: "Prüfpunkte mit Mangel",
      }
    }
    if (!unit.inspection.completedAt) {
      const open = progress.total - progress.checked
      return open > 0
        ? { value: open, tone: "warn", srLabel: "Prüfpunkte offen" }
        : null
    }
    return null
  }

  if (key === "refurbishment") {
    const open = unit.repairs.filter((r) => r.status !== "ERLEDIGT").length
    return open > 0
      ? { value: open, tone: "warn", srLabel: "Reparaturen offen" }
      : null
  }

  if (key === "images") {
    return unit.images.length > 0
      ? { value: unit.images.length, tone: "neutral", srLabel: "Bilder" }
      : null
  }

  if (key === "channels") {
    const failed = unit.listings.filter((l) => l.status === "FEHLER").length
    if (failed > 0) {
      return { value: failed, tone: "error", srLabel: "Kanäle mit Fehler" }
    }
    const live = unit.listings.filter(
      (l) => l.status === "VEROEFFENTLICHT"
    ).length
    return live > 0
      ? { value: live, tone: "neutral", srLabel: "Kanäle veröffentlicht" }
      : null
  }

  return null
}
