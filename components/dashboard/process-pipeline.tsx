"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { Panel, PanelBody, PanelHeader } from "@/components/skope/primitives"
import { usePipeline } from "@/hooks/use-cockpit"
import { FOCUS_RING } from "@/components/skope/focus"
import { cn } from "@/lib/utils"

/**
 * Prozessübersicht: wie viele Geräte auf welcher Stufe stehen.
 *
 * Bewusst als Verlauf und nicht als Balkendiagramm — die Reihenfolge der
 * Stufen ist die eigentliche Information. Die Balkenbreite unter den Zahlen
 * zeigt zusätzlich das Verhältnis zueinander.
 */

/**
 * Farbe je Stufe — identisch zu den Bestandskacheln und den Statusabzeichen.
 * Eine Stufe hat im ganzen Cockpit genau eine Farbe.
 */
const STAGE_TONE: Record<string, { text: string; bar: string }> = {
  EINGEGANGEN: { text: "text-state-info", bar: "bg-state-info" },
  IN_PRUEFUNG: { text: "text-state-warn", bar: "bg-state-warn" },
  AUFBEREITUNG: { text: "text-state-progress", bar: "bg-state-progress" },
  VERKAUFSBEREIT: { text: "text-state-ready", bar: "bg-state-ready" },
  INSERIERT: { text: "text-state-live", bar: "bg-state-live" },
  VERKAUFT: { text: "text-skope-accent", bar: "bg-skope-accent" },
}

const STAGE_LINKS: Record<string, string> = {
  EINGEGANGEN: "/inbound",
  IN_PRUEFUNG: "/inspection",
  AUFBEREITUNG: "/refurbishment",
  VERKAUFSBEREIT: "/scooters?workflow=VERKAUFSBEREIT",
  INSERIERT: "/scooters?listed=ja",
  VERKAUFT: "/sales",
}

export function ProcessPipeline() {
  const stages = usePipeline()
  const max = Math.max(...stages.map((stage) => stage.count), 1)

  return (
    <Panel>
      <PanelHeader
        title="Prozessübersicht"
        description="Verteilung des Bestands über die Stufen des Warenprozesses."
      />
      <PanelBody>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {stages.map((stage, index) => {
            const isLast = index === stages.length - 1
            const tone = STAGE_TONE[stage.key] ?? {
              text: "text-foreground",
              bar: "bg-skope-steel/70",
            }
            return (
              <li key={stage.key} className="relative">
                <Link
                  href={STAGE_LINKS[stage.key] ?? "/scooters"}
                  className={cn(
                    "group block h-full rounded-lg border border-skope-line bg-surface-sunken p-3.5 transition-all duration-200",
                    "hover:border-skope-line-strong hover:bg-surface-raised",
                    FOCUS_RING
                  )}
                >
                  <p className="type-caption leading-tight font-medium tracking-wide text-muted-foreground uppercase">
                    {stage.label}
                  </p>
                  <p className={cn("mt-2 type-metric transition-colors", tone.text)}>
                    {stage.count}
                  </p>
                  <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-track">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-300",
                        tone.bar
                      )}
                      style={{ width: `${Math.max(4, (stage.count / max) * 100)}%` }}
                    />
                  </div>
                </Link>

                {/* Pfeil zwischen den Stufen — nur dort, wo Platz ist. */}
                {!isLast && (
                  <ChevronRight
                    className="absolute top-1/2 -right-[9px] hidden size-3.5 -translate-y-1/2 text-skope-line-strong xl:block"
                    aria-hidden
                  />
                )}
              </li>
            )
          })}
        </ol>
      </PanelBody>
    </Panel>
  )
}
