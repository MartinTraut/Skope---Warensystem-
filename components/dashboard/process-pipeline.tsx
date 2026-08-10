"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { Panel, PanelBody, PanelHeader } from "@/components/skope/primitives"
import { usePipeline } from "@/hooks/use-cockpit"
import { cn } from "@/lib/utils"

/**
 * Prozessübersicht: wie viele Geräte auf welcher Stufe stehen.
 *
 * Bewusst als Verlauf und nicht als Balkendiagramm — die Reihenfolge der
 * Stufen ist die eigentliche Information. Die Balkenbreite unter den Zahlen
 * zeigt zusätzlich das Verhältnis zueinander.
 */

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
            return (
              <li key={stage.key} className="relative">
                <Link
                  href={STAGE_LINKS[stage.key] ?? "/scooters"}
                  className={cn(
                    "group block h-full rounded-lg border border-skope-line bg-white/2 p-3.5 transition-all duration-200",
                    "hover:border-skope-gold/30 hover:bg-skope-gold/5",
                    "focus-visible:border-skope-gold/50 focus-visible:ring-3 focus-visible:ring-skope-gold/15 focus-visible:outline-none"
                  )}
                >
                  <p className="text-[11px] leading-tight font-medium tracking-wide text-muted-foreground uppercase">
                    {stage.label}
                  </p>
                  <p
                    className={cn(
                      "mt-2 text-2xl leading-none font-medium tabular-nums transition-colors",
                      isLast
                        ? "text-skope-gold"
                        : "text-foreground group-hover:text-skope-gold"
                    )}
                  >
                    {stage.count}
                  </p>
                  <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-white/6">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        isLast ? "bg-skope-gold" : "bg-skope-steel/70"
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
