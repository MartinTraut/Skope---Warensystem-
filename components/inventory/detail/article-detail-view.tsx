"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowLeftRight, Minus, Pencil, Plus, Tag } from "lucide-react"

import { ConditionBadge, StockModeBadge } from "@/components/shared/badges"
import { TabBar, type TabBadge } from "@/components/skope/tab-bar"
import { ImageGallery } from "@/components/shared/image-gallery"
import { EditArticleDialog } from "../edit-article-dialog"
import {
  IssueDialog,
  ReceiveDialog,
  SellQuantityDialog,
  TransferDialog,
} from "../stock-dialogs"
import { TabArticleChannels } from "./tab-article-channels"
import { TabArticleOverview } from "./tab-article-overview"
import { TabArticleStock } from "./tab-article-stock"
import { TabArticleUnits } from "./tab-article-units"
import { ActivityList } from "@/components/dashboard/activity-feed"
import {
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/skope/primitives"
import { PanelSkeleton } from "@/components/skope/skeletons"
import { Button } from "@/components/ui/button"
import { useActivity, useArticleView, useHydrated } from "@/hooks/use-cockpit"
import { repositories } from "@/lib/data/demo-repository"
import { articleLabel } from "@/lib/domain/article-factory"
import type { ArticleView } from "@/lib/domain/types"

type TabKey = "overview" | "stock" | "units" | "images" | "channels" | "history"

/**
 * Detailansicht eines Artikels.
 *
 * Der Aufbau richtet sich nach der Bestandsart: Ein Mengenartikel führt
 * Buchungen, ein serialisierter Artikel führt Geräte. Beides in derselben
 * Ansicht zu zeigen, hieße überall die Hälfte auszugrauen.
 */
export function ArticleDetailView({ articleId }: { articleId: string }) {
  const hydrated = useHydrated()
  const view = useArticleView(articleId)
  const [tab, setTab] = useState<TabKey>("overview")
  const [editOpen, setEditOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [sellOpen, setSellOpen] = useState(false)

  if (!hydrated) {
    return (
      <div className="space-y-6">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
    )
  }

  if (!view) {
    return (
      <Panel>
        <EmptyState
          title="Artikel nicht gefunden"
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

  const { article, settings, stock } = view
  const isBulk = article.stockMode === "MENGE"

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Übersicht" },
    { key: "stock", label: "Bestand" },
    ...(isBulk ? [] : [{ key: "units" as const, label: "Geräte" }]),
    { key: "images", label: "Bilder" },
    { key: "channels", label: "Kanäle" },
    { key: "history", label: "Historie" },
  ]

  return (
    <div className="space-y-6">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-skope-accent/25 focus-visible:outline-none"
      >
        <ArrowLeft className="size-3.5" />
        Zurück zum Bestand
      </Link>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm text-skope-accent">{article.sku}</p>
          <h1 className="type-page-title mt-1 text-foreground">
            {articleLabel(article)}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StockModeBadge mode={article.stockMode} />
            <ConditionBadge condition={article.condition} />
            <span className="text-xs text-muted-foreground">
              {settings.pathLabel}
            </span>
            {article.mpn && (
              <span className="font-mono text-xs text-muted-foreground">
                {article.mpn}
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
          {isBulk && (
            <>
              <Button
                variant="outline"
                className="h-10 gap-2 px-4"
                onClick={() => setTransferOpen(true)}
                disabled={stock.quantity === 0}
              >
                <ArrowLeftRight className="size-4" />
                Umlagern
              </Button>
              <Button
                variant="outline"
                className="h-10 gap-2 px-4"
                onClick={() => setIssueOpen(true)}
                disabled={stock.quantity === 0}
              >
                <Minus className="size-4" />
                Abgang
              </Button>
              <Button
                variant="outline"
                className="h-10 gap-2 px-4"
                onClick={() => setSellOpen(true)}
                disabled={stock.quantity === 0}
              >
                <Tag className="size-4" />
                Verkauf
              </Button>
              <Button className="h-10 gap-2 px-4" onClick={() => setReceiveOpen(true)}>
                <Plus className="size-4" />
                Zugang buchen
              </Button>
            </>
          )}
        </div>
      </header>

      <TabBar
        items={tabs.map((entry) => ({
          ...entry,
          badge: tabBadge(entry.key, view),
        }))}
        value={tab}
        onChange={setTab}
        idPrefix="article"
      />

      <div
        key={tab}
        id={`article-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`article-tab-${tab}`}
        className="animate-rise"
      >
        {tab === "overview" && <TabArticleOverview view={view} />}
        {tab === "stock" && <TabArticleStock view={view} />}
        {tab === "units" && <TabArticleUnits view={view} />}
        {tab === "images" && (
          <ImageGallery
            images={article.images}
            subject="Artikel"
            api={{
              add: (images) => repositories.articles.addImages(article.id, images),
              remove: (imageId) =>
                repositories.articles.removeImage(article.id, imageId),
              setPrimary: (imageId) =>
                repositories.articles.setPrimaryImage(article.id, imageId),
              reorder: (imageIds) =>
                repositories.articles.reorderImages(article.id, imageIds),
            }}
          />
        )}
        {tab === "channels" && <TabArticleChannels view={view} />}
        {tab === "history" && <HistoryTab view={view} />}
      </div>

      <EditArticleDialog
        article={article}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {isBulk && (
        <>
          <ReceiveDialog
            article={article}
            open={receiveOpen}
            onOpenChange={setReceiveOpen}
          />
          <IssueDialog
            article={article}
            open={issueOpen}
            onOpenChange={setIssueOpen}
          />
          <TransferDialog
            article={article}
            open={transferOpen}
            onOpenChange={setTransferOpen}
          />
          <SellQuantityDialog
            article={article}
            open={sellOpen}
            onOpenChange={setSellOpen}
          />
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Historie                                                            */
/* ------------------------------------------------------------------ */

function HistoryTab({ view }: { view: ArticleView }) {
  const activity = useActivity()
  const events = activity.filter((event) => event.articleId === view.article.id)

  return (
    <Panel>
      <PanelHeader
        title="Historie"
        description="Alle Ereignisse zu diesem Artikel, neueste zuerst."
      />
      <PanelBody>
        {events.length === 0 ? (
          <EmptyState
            title="Noch keine Ereignisse"
            description="Sobald gebucht, bearbeitet oder veröffentlicht wird, entsteht hier ein lückenloses Protokoll."
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

function tabBadge(key: TabKey, view: ArticleView): TabBadge | null {
  if (key === "stock") {
    if (view.article.stockMode !== "MENGE") return null
    if (view.stock.belowReorderLevel) {
      return {
        value: view.stock.quantity,
        tone: "warn",
        srLabel: "Stück auf Bestand, unter dem Meldebestand",
      }
    }
    return {
      value: view.stock.quantity,
      tone: "neutral",
      srLabel: "Stück auf Bestand",
    }
  }

  if (key === "units") {
    return view.unitsInStock.length > 0
      ? {
          value: view.unitsInStock.length,
          tone: "neutral",
          srLabel: "Einzelstücke auf Bestand",
        }
      : null
  }

  if (key === "images") {
    return view.article.images.length > 0
      ? {
          value: view.article.images.length,
          tone: "neutral",
          srLabel: "Bilder",
        }
      : null
  }

  if (key === "channels") {
    const failed = view.article.listings.filter(
      (listing) => listing.status === "FEHLER"
    ).length
    if (failed > 0) {
      return { value: failed, tone: "error", srLabel: "Kanäle mit Fehler" }
    }
    const live = view.article.listings.filter(
      (listing) => listing.status === "VEROEFFENTLICHT"
    ).length
    return live > 0
      ? { value: live, tone: "neutral", srLabel: "Kanäle veröffentlicht" }
      : null
  }

  return null
}
