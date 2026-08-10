"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/skope/primitives"
import { ListSkeleton } from "@/components/skope/skeletons"
import { RelativeTime } from "@/components/skope/client-time"
import { useActivity, useHydrated } from "@/hooks/use-cockpit"
import type { AuditEvent } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

const LEVEL_DOT: Record<AuditEvent["level"], string> = {
  info: "bg-skope-steel/60",
  success: "bg-state-ready",
  warning: "bg-state-warn",
  error: "bg-state-error",
}

/** Die letzten Ereignisse — der Puls des Betriebs. */
export function ActivityFeed({ limit = 8 }: { limit?: number }) {
  const hydrated = useHydrated()
  const activity = useActivity()
  const events = activity.slice(0, limit)

  return (
    <Panel>
      <PanelHeader
        title="Letzte Aktivitäten"
        action={
          <Link
            href="/activity"
            className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-skope-gold focus-visible:ring-3 focus-visible:ring-skope-gold/25 focus-visible:outline-none"
          >
            Alle anzeigen
            <ArrowUpRight className="size-3.5" />
          </Link>
        }
      />
      <PanelBody>
        {!hydrated ? (
          <ListSkeleton rows={6} />
        ) : events.length === 0 ? (
          <EmptyState
            title="Noch keine Aktivitäten"
            description="Sobald Scooter erfasst oder Vorgänge ausgelöst werden, erscheinen sie hier."
          />
        ) : (
          <ActivityList events={events} />
        )}
      </PanelBody>
    </Panel>
  )
}

export function ActivityList({ events }: { events: AuditEvent[] }) {
  return (
    <ol className="relative space-y-0">
      {events.map((event, index) => (
        <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
          {/* Verbindungslinie zwischen den Ereignissen */}
          {index < events.length - 1 && (
            <span
              className="absolute top-4 bottom-0 left-[3.5px] w-px bg-skope-line"
              aria-hidden
            />
          )}
          <span
            className={cn(
              "relative z-10 mt-1.5 size-2 shrink-0 rounded-full ring-4 ring-[#0d0e10]",
              LEVEL_DOT[event.level]
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {event.scooterNumber && event.scooterId ? (
                <Link
                  href={`/scooters/${event.scooterId}`}
                  className="rounded font-mono text-[0.8125rem] font-medium text-foreground transition-colors hover:text-skope-gold focus-visible:ring-3 focus-visible:ring-skope-gold/25 focus-visible:outline-none"
                >
                  {event.scooterNumber}
                </Link>
              ) : (
                <span className="text-[0.8125rem] font-medium text-foreground">
                  System
                </span>
              )}
              <span className="text-[0.8125rem] text-foreground/85">
                {event.action}
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {event.detail}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              <RelativeTime iso={event.at} /> · {event.actor}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
