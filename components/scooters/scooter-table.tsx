"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"

import {
  ChannelIndicators,
  ListingBadge,
  SaleBadge,
  ScooterIdentity,
  WorkflowBadge,
} from "./badges"
import { EmptyState } from "@/components/skope/primitives"
import { RelativeTime } from "@/components/skope/client-time"
import { formatCents, formatKm } from "@/lib/domain/money"
import { expectedMarginCents } from "@/lib/domain/metrics"
import { getListing } from "@/lib/domain/status"
import type { Scooter } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/**
 * Bestandstabelle.
 *
 * Ab 1024 px eine echte Tabelle, darunter Karten — eine horizontal scrollende
 * Tabelle mit elf Spalten ist am Telefon unbenutzbar. Beide Darstellungen
 * zeigen dieselben Daten und führen auf dieselbe Detailseite.
 */

interface ScooterTableProps {
  scooters: Scooter[]
  variant?: "full" | "compact"
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
}

export function ScooterTable({
  scooters,
  variant = "full",
  emptyTitle = "Keine Scooter gefunden",
  emptyDescription = "Passe die Filter an oder lege einen neuen Scooter an.",
  emptyAction,
}: ScooterTableProps) {
  if (scooters.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    )
  }

  return (
    <>
      <div className="hidden lg:block">
        <DesktopTable scooters={scooters} variant={variant} />
      </div>
      <ul className="divide-y divide-skope-line lg:hidden">
        {scooters.map((scooter) => (
          <li key={scooter.id}>
            <MobileCard scooter={scooter} />
          </li>
        ))}
      </ul>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Desktop                                                             */
/* ------------------------------------------------------------------ */

function DesktopTable({
  scooters,
  variant,
}: {
  scooters: Scooter[]
  variant: "full" | "compact"
}) {
  const full = variant === "full"

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-skope-line">
          <Th className="pl-4 sm:pl-5">Scooter</Th>
          {full && <Th>Seriennummer</Th>}
          {full && <Th align="right">Einkauf</Th>}
          <Th align="right">Verkauf</Th>
          {full && <Th align="right">Marge</Th>}
          <Th>Workflow</Th>
          <Th>Verkauf</Th>
          <Th>Kanäle</Th>
          {full && <Th>Standort</Th>}
          <Th align="right" className="pr-4 sm:pr-5">
            {full ? "Geändert" : "Zuletzt"}
          </Th>
          <Th className="w-10 pr-4 sm:pr-5">
            <span className="sr-only">Öffnen</span>
          </Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-skope-line">
        {scooters.map((scooter) => {
          const margin = expectedMarginCents(scooter)
          return (
            <tr
              key={scooter.id}
              className="group transition-colors duration-150 hover:bg-white/2"
            >
              <Td className="pl-4 sm:pl-5">
                <ScooterIdentity
                  scooter={scooter}
                  href={`/scooters/${scooter.id}`}
                  className="max-w-[16rem]"
                />
              </Td>
              {full && (
                <Td>
                  <span className="font-mono text-xs text-muted-foreground">
                    {scooter.serialNumber || "—"}
                  </span>
                </Td>
              )}
              {full && (
                <Td align="right" className="tabular-nums text-muted-foreground">
                  {formatCents(scooter.purchasePriceCents)}
                </Td>
              )}
              <Td align="right" className="tabular-nums font-medium text-foreground">
                {formatCents(scooter.salePriceCents)}
              </Td>
              {full && (
                <Td align="right" className="tabular-nums">
                  <MarginValue cents={margin} />
                </Td>
              )}
              <Td>
                <WorkflowBadge status={scooter.workflowStatus} size="sm" />
              </Td>
              <Td>
                <SaleBadge status={scooter.saleStatus} size="sm" />
              </Td>
              <Td>
                <ChannelIndicators scooter={scooter} />
              </Td>
              {full && (
                <Td className="text-xs text-muted-foreground">
                  {scooter.location}
                </Td>
              )}
              <Td
                align="right"
                className="pr-4 text-xs whitespace-nowrap text-muted-foreground sm:pr-5"
              >
                <RelativeTime iso={scooter.updatedAt} />
              </Td>
              <Td className="pr-4 sm:pr-5">
                <Link
                  href={`/scooters/${scooter.id}`}
                  aria-label={`${scooter.scooterNumber} öffnen`}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground/50 transition-colors group-hover:text-skope-gold focus-visible:ring-3 focus-visible:ring-skope-gold/25 focus-visible:outline-none"
                >
                  <ChevronRight className="size-4" />
                </Link>
              </Td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Th({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode
  align?: "left" | "right"
  className?: string
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2.5 text-[10px] font-medium tracking-[0.1em] text-muted-foreground/80 uppercase",
        align === "right" && "text-right",
        className
      )}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode
  align?: "left" | "right"
  className?: string
}) {
  return (
    <td
      className={cn("px-3 py-3", align === "right" && "text-right", className)}
    >
      {children}
    </td>
  )
}

function MarginValue({ cents }: { cents: number | null }) {
  if (cents === null) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <span
      className={cn(
        "font-medium",
        cents < 0 ? "text-state-error" : "text-state-ready"
      )}
    >
      {formatCents(cents)}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Mobil                                                               */
/* ------------------------------------------------------------------ */

function MobileCard({ scooter }: { scooter: Scooter }) {
  const shopify = getListing(scooter, "SHOPIFY")

  return (
    <Link
      href={`/scooters/${scooter.id}`}
      className="block px-4 py-4 transition-colors active:bg-white/4 focus-visible:bg-white/4 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium text-foreground">
            {scooter.scooterNumber}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {[scooter.manufacturer, scooter.model].filter(Boolean).join(" ")}
          </p>
        </div>
        <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">
          {formatCents(scooter.salePriceCents)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <WorkflowBadge status={scooter.workflowStatus} size="sm" />
        <SaleBadge status={scooter.saleStatus} size="sm" />
        {shopify?.status === "FEHLER" && (
          <ListingBadge status="FEHLER" size="sm" />
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <ChannelIndicators scooter={scooter} />
        <p className="text-[11px] text-muted-foreground">
          {formatKm(scooter.mileageKm)} · {scooter.location}
        </p>
      </div>
    </Link>
  )
}
