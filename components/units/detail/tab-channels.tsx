"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Check, Copy, ExternalLink, RotateCw, Store, Tag } from "lucide-react"

import { ListingBadge } from "@/components/shared/badges"
import { DateTimeText } from "@/components/skope/client-time"
import {
  DataField,
  DataGrid,
  DemoTag,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/skope/primitives"
import { StatusPill } from "@/components/skope/status-pill"
import { Button } from "@/components/ui/button"
import { useArticle, useCategorySettings, useUnitReadiness } from "@/hooks/use-cockpit"
import { mockChannelNote, repositories } from "@/lib/data/demo-repository"
import { buildUnitListing, resolveChannel } from "@/lib/domain/publishing"
import { formatCents } from "@/lib/domain/money"
import { CHANNEL_META, PUBLISH_MODE_META } from "@/lib/domain/status"
import { CHANNELS, type ArticleUnit, type Channel } from "@/lib/domain/types"

/**
 * Verkaufskanäle eines Geräts.
 *
 * Eine Karte je Kanal, alle nach demselben Muster. Der Unterschied steckt in
 * `CHANNEL_META.automated`: Shopify wird über einen Adapter bedient, eBay und
 * Kleinanzeigen liefern das fertige Inserat zum Übernehmen. Die Karte sagt
 * ausdrücklich, welcher Fall vorliegt — sonst entsteht der Eindruck, das
 * System stelle überall selbst ein.
 */
export function TabChannels({ unit }: { unit: ArticleUnit }) {
  const article = useArticle(unit.articleId)
  const settings = useCategorySettings(article?.categoryId)
  const checks = useUnitReadiness(unit)
  const ready = checks.every((check) => check.ok)

  const routed = article ? resolveChannel(article, settings) : null
  const content = article ? buildUnitListing(article, unit, settings) : null

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          title="Kanalregel"
          description="Kommt aus dem Bereich und lässt sich am Artikel übersteuern."
        />
        <PanelBody>
          <DataGrid className="sm:grid-cols-3 lg:grid-cols-3">
            <DataField label="Bereich" value={settings.pathLabel || "—"} />
            <DataField
              label="Zielkanal"
              value={routed ? CHANNEL_META[routed].label : "Kein Kanal hinterlegt"}
            />
            <DataField
              label="Automatik"
              value={
                <StatusPill
                  tone={PUBLISH_MODE_META[settings.publishMode].tone}
                  size="sm"
                  dot={false}
                >
                  {PUBLISH_MODE_META[settings.publishMode].label}
                </StatusPill>
              }
            />
          </DataGrid>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            {PUBLISH_MODE_META[settings.publishMode].description}
            {!ready &&
              " Solange Voraussetzungen offen sind, entsteht kein Vorschlag — die offenen Punkte stehen auf der Übersicht."}
          </p>
        </PanelBody>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        {CHANNELS.map((channel) => (
          <ChannelCard
            key={channel}
            unit={unit}
            channel={channel}
            ready={ready}
            routed={routed === channel}
            listingText={content ? formatListingText(content) : ""}
          />
        ))}
      </div>
    </div>
  )
}

function formatListingText(content: ReturnType<typeof buildUnitListing>): string {
  return [
    content.title,
    "",
    content.description,
    "",
    `Preis: ${formatCents(content.priceCents)}`,
  ].join("\n")
}

/* ------------------------------------------------------------------ */
/* Kanalkarte                                                          */
/* ------------------------------------------------------------------ */

function ChannelCard({
  unit,
  channel,
  ready,
  routed,
  listingText,
}: {
  unit: ArticleUnit
  channel: Channel
  ready: boolean
  routed: boolean
  listingText: string
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const meta = CHANNEL_META[channel]
  const listing = unit.listings.find((entry) => entry.channel === channel)
  if (!listing) return null

  const published = listing.status === "VEROEFFENTLICHT"
  const failed = listing.status === "FEHLER"
  const sold = unit.saleStatus === "VERKAUFT"
  const stillActive =
    listing.status !== "DEAKTIVIERT" &&
    listing.status !== "NICHT_VEROEFFENTLICHT"

  const target = { type: "UNIT" as const, id: unit.id }

  async function run(
    action: "publish" | "update" | "deactivate" | "retry",
    label: string
  ) {
    setBusy(action)
    const result =
      action === "publish"
        ? await repositories.publishing.publishUnit(unit.id, channel)
        : action === "update"
          ? await repositories.publishing.updateListing(target, channel)
          : action === "retry"
            ? await repositories.publishing.retry(target, channel)
            : await repositories.publishing.deactivate(target, channel)
    setBusy(null)

    if (!result.ok) {
      // Fehlgeschlagen heißt fehlgeschlagen — der Status steht jetzt auf FEHLER.
      toast.error(`${label} fehlgeschlagen`, {
        description: result.message,
        action: {
          label: "Erneut versuchen",
          onClick: () => run("retry", label),
        },
      })
      return
    }

    const note = mockChannelNote(channel)
    const outcome =
      action === "deactivate"
        ? "Angebot geschlossen, Bestand auf 0 gesetzt."
        : meta.automated
          ? `Auf ${meta.label} veröffentlicht.`
          : `Als auf ${meta.label} inseriert vermerkt.`
    toast.success(`${label} erfolgreich`, {
      description: note ? `${outcome} ${note}` : outcome,
    })
  }

  async function copyListing() {
    try {
      await navigator.clipboard.writeText(listingText)
      setCopied(true)
      // Kurz sichtbar lassen und dann zurücksetzen — ein dauerhaft grüner
      // Haken behauptet, es sei gerade eben kopiert worden.
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error("Kopieren nicht möglich", {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <Panel accent={routed}>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            {meta.automated ? (
              <Store className="size-4 text-muted-foreground" />
            ) : (
              <Tag className="size-4 text-muted-foreground" />
            )}
            {meta.label}
            {meta.automated && <DemoTag />}
            {routed && (
              <StatusPill tone="progress" size="sm" dot={false}>
                Zielkanal
              </StatusPill>
            )}
          </span>
        }
        description={meta.hint}
        action={<ListingBadge status={listing.status} size="sm" />}
      />
      <PanelBody className="space-y-4">
        <DataGrid className="grid-cols-2 sm:grid-cols-2 lg:grid-cols-2">
          <DataField label="Preis" value={formatCents(listing.priceCents)} />
          <DataField
            label="Letzte Übertragung"
            value={<DateTimeText iso={listing.lastSyncedAt} />}
          />
        </DataGrid>

        {listing.externalUrl && (
          <a
            href={listing.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded text-xs text-skope-accent transition-colors hover:underline"
          >
            <ExternalLink className="size-3.5" />
            Angebot öffnen
          </a>
        )}

        {failed && listing.lastError && (
          <div className="rounded-lg border border-state-error/25 bg-state-error/8 p-3">
            <p className="text-xs font-medium text-state-error">
              Übertragung fehlgeschlagen
            </p>
            <p className="mt-1 text-xs leading-relaxed text-state-error/85">
              {listing.lastError}
            </p>
            {listing.retryCount > 0 && (
              <p className="mt-1.5 type-caption text-state-error/70">
                {listing.retryCount} Wiederholung(en) bisher
              </p>
            )}
          </div>
        )}

        {!ready && !published && (
          <p className="rounded-lg border border-state-warn/25 bg-state-warn/8 px-3 py-2 text-xs text-state-warn">
            Noch nicht freigabefähig — die offenen Punkte stehen auf der
            Übersicht.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!published && !sold && (
            <Button
              className="h-10 px-4"
              disabled={!ready || busy !== null}
              onClick={() => run("publish", meta.automated ? "Veröffentlichung" : "Vermerk")}
            >
              {busy === "publish"
                ? "…"
                : meta.automated
                  ? "Veröffentlichen"
                  : "Als inseriert markieren"}
            </Button>
          )}

          {published && meta.automated && (
            <Button
              variant="outline"
              className="h-10 px-4"
              disabled={busy !== null}
              onClick={() => run("update", "Aktualisierung")}
            >
              {busy === "update" ? "…" : "Aktualisieren"}
            </Button>
          )}

          {failed && (
            <Button
              variant="outline"
              className="h-10 gap-2 px-4"
              disabled={busy !== null}
              onClick={() => run("retry", "Wiederholung")}
            >
              <RotateCw className="size-4" />
              {busy === "retry" ? "…" : "Wiederholen"}
            </Button>
          )}

          {stillActive && (
            <Button
              variant="outline"
              className="h-10 px-4"
              disabled={busy !== null}
              onClick={() => run("deactivate", "Deaktivierung")}
            >
              {busy === "deactivate" ? "…" : "Angebot schließen"}
            </Button>
          )}

          {!meta.automated && listingText && (
            <Button
              variant="outline"
              className="h-10 gap-2 px-4"
              onClick={copyListing}
            >
              {copied ? (
                <Check className="size-4 text-state-ready" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "Kopiert" : "Inserat kopieren"}
            </Button>
          )}
        </div>
      </PanelBody>
    </Panel>
  )
}
