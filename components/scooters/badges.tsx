import Link from "next/link"

import { StatusPill } from "@/components/skope/status-pill"
import {
  CHANNEL_META,
  CONDITION_META,
  LISTING_STATUS_META,
  SALE_STATUS_META,
  SYNC_STATUS_META,
  WORKFLOW_META,
  getListing,
} from "@/lib/domain/status"
import type {
  Channel,
  Condition,
  ListingStatus,
  SaleStatus,
  Scooter,
  SyncStatus,
  WorkflowStatus,
} from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/** Statusanzeigen, die in Tabellen, Karten und Detailseiten identisch aussehen. */

export function WorkflowBadge({
  status,
  size = "md",
}: {
  status: WorkflowStatus
  size?: "sm" | "md"
}) {
  const meta = WORKFLOW_META[status]
  return (
    <StatusPill
      tone={meta.tone}
      size={size}
      pulse={status === "IN_PRUEFUNG" || status === "AUFBEREITUNG"}
    >
      {meta.label}
    </StatusPill>
  )
}

export function SaleBadge({
  status,
  size = "md",
}: {
  status: SaleStatus
  size?: "sm" | "md"
}) {
  const meta = SALE_STATUS_META[status]
  return (
    <StatusPill tone={meta.tone} size={size}>
      {meta.label}
    </StatusPill>
  )
}

export function ListingBadge({
  status,
  size = "md",
}: {
  status: ListingStatus
  size?: "sm" | "md"
}) {
  const meta = LISTING_STATUS_META[status]
  return (
    <StatusPill
      tone={meta.tone}
      size={size}
      pulse={status === "SYNC_AUSSTEHEND"}
    >
      {meta.label}
    </StatusPill>
  )
}

export function ConditionBadge({ condition }: { condition: Condition }) {
  const meta = CONDITION_META[condition]
  return (
    <StatusPill tone={meta.tone} size="sm" dot={false}>
      {meta.label}
    </StatusPill>
  )
}

export function SyncBadge({
  status,
  size = "sm",
}: {
  status: SyncStatus
  size?: "sm" | "md"
}) {
  const meta = SYNC_STATUS_META[status]
  return (
    <StatusPill tone={meta.tone} size={size} pulse={status === "WARTET"}>
      {meta.label}
    </StatusPill>
  )
}

/* ------------------------------------------------------------------ */
/* Kanalanzeige                                                        */
/* ------------------------------------------------------------------ */

const CHANNEL_DOT: Record<ListingStatus, string> = {
  VEROEFFENTLICHT: "bg-state-live border-state-live/40",
  SYNC_AUSSTEHEND: "bg-skope-accent border-skope-accent/40 animate-pulse-soft",
  FEHLER: "bg-state-error border-state-error/40",
  DEAKTIVIERT: "bg-muted-foreground/40 border-white/8",
  NICHT_VEROEFFENTLICHT: "bg-transparent border-white/12",
}

/**
 * Kompakte Kanalanzeige für Tabellenzeilen: je Kanal ein Kürzel mit Punkt.
 * Auf einen Blick erkennbar, ohne die Zeile mit Text zu füllen.
 */
export function ChannelIndicators({
  scooter,
  className,
}: {
  scooter: Scooter
  className?: string
}) {
  const channels: Channel[] = ["SHOPIFY", "KLEINANZEIGEN"]

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {channels.map((channel) => {
        const listing = getListing(scooter, channel)
        const status = listing?.status ?? "NICHT_VEROEFFENTLICHT"
        return (
          <span
            key={channel}
            title={`${CHANNEL_META[channel].label}: ${LISTING_STATUS_META[status].label}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
              status === "NICHT_VEROEFFENTLICHT"
                ? "border-white/6 text-muted-foreground/50"
                : "border-white/8 text-foreground/75"
            )}
          >
            <span
              className={cn("size-1.5 rounded-full border", CHANNEL_DOT[status])}
              aria-hidden
            />
            {CHANNEL_META[channel].short}
          </span>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Identität                                                           */
/* ------------------------------------------------------------------ */

/** Scooter-Nummer plus Modell — die Standardkennung in allen Listen. */
export function ScooterIdentity({
  scooter,
  href,
  className,
}: {
  scooter: Scooter
  href?: string
  className?: string
}) {
  const content = (
    <>
      <span className="block font-mono type-body-sm font-medium text-foreground group-hover:text-skope-accent">
        {scooter.scooterNumber}
      </span>
      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
        {[scooter.manufacturer, scooter.model, scooter.variant]
          .filter(Boolean)
          .join(" ")}
      </span>
    </>
  )

  if (!href) {
    return <div className={cn("min-w-0", className)}>{content}</div>
  }

  return (
    <Link
      href={href}
      className={cn(
        "group block min-w-0 rounded-md transition-colors focus-visible:ring-3 focus-visible:ring-skope-accent/25 focus-visible:outline-none",
        className
      )}
    >
      {content}
    </Link>
  )
}
