"use client"

import { useRef } from "react"

import { FOCUS_RING } from "@/components/skope/focus"
import { cn } from "@/lib/utils"

/**
 * Reiterleiste — ein Baustein für alle Detailseiten.
 *
 * Artikel- und Gerätedetail hatten dieselbe Leiste zweimal wörtlich im Code.
 * Zwei Kopien sind kein zweiter Baustein, sondern einer, der auseinanderläuft:
 * Jede Verbesserung an der einen Stelle fehlt an der anderen, bis beide
 * Ansichten sich unterschiedlich bedienen.
 *
 * Drei Dinge sind gegenüber den Kopien anders:
 *
 * 1. Die Zahl am Reiter trägt den Zustand mit. Vorher war sie immer grau —
 *    auf dem aktiven Reiter stand eine graue Zahl neben weißer Schrift und
 *    wirkte wie abgeschaltet. Jetzt nimmt sie auf dem aktiven Reiter die
 *    Akzentfarbe an; Warnung und Fehler behalten ihre Farbe in beiden
 *    Zuständen, weil sie eine Aussage tragen und keinen Zustand.
 *
 * 2. Die Zahl hat einen Namen. „10" neben „Bestand" ist ohne Kontext nicht
 *    lesbar — am Vorleser gar nicht. `srLabel` sagt, was gezählt wird.
 *
 * 3. Die Leiste ist per Tastatur bedienbar. `role="tablist"` verspricht
 *    Pfeiltasten; ohne sie ist die Rolle eine Falschauskunft an die
 *    Hilfstechnik. Der Fokus wandert mit Links/Rechts, Pos1 und Ende, und nur
 *    der aktive Reiter liegt in der Tab-Reihenfolge (roving tabindex).
 */
export type TabBadgeTone = "neutral" | "warn" | "error"

export interface TabBadge {
  value: number
  tone: TabBadgeTone
  /** Was gezählt wird — für Vorleser, z. B. „Stück auf Bestand". */
  srLabel?: string
}

export interface TabItem<K extends string> {
  key: K
  label: string
  badge?: TabBadge | null
}

export function TabBar<K extends string>({
  items,
  value,
  onChange,
  idPrefix,
  label = "Bereiche",
}: {
  items: TabItem<K>[]
  value: K
  onChange: (key: K) => void
  /** Verbindet Reiter und Inhalt: `${idPrefix}-tab-…` und `${idPrefix}-panel-…`. */
  idPrefix: string
  label?: string
}) {
  const listRef = useRef<HTMLDivElement>(null)

  function move(offset: number, from: number) {
    const next = (from + offset + items.length) % items.length
    onChange(items[next].key)
    // Der Fokus muss mitwandern, sonst steht die Auswahl auf dem einen und
    // die Tastatur auf dem anderen Reiter.
    listRef.current
      ?.querySelectorAll<HTMLButtonElement>("[role='tab']")
      [next]?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault()
        move(1, index)
        break
      case "ArrowLeft":
        event.preventDefault()
        move(-1, index)
        break
      case "Home":
        event.preventDefault()
        move(-index, index)
        break
      case "End":
        event.preventDefault()
        move(items.length - 1 - index, index)
        break
    }
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        className="flex w-max min-w-full gap-1 border-b border-skope-line"
      >
        {items.map((entry, index) => {
          const active = entry.key === value
          const badge = entry.badge ?? null
          return (
            <button
              key={entry.key}
              role="tab"
              id={`${idPrefix}-tab-${entry.key}`}
              aria-selected={active}
              aria-controls={`${idPrefix}-panel-${entry.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(entry.key)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "group relative flex h-11 items-center gap-2 px-3.5 text-sm whitespace-nowrap transition-colors duration-fast",
                FOCUS_RING,
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {entry.label}
              {badge !== null && (
                <span
                  className={cn(
                    "grid h-5 min-w-5 place-items-center rounded-full px-1.5 type-micro font-medium transition-colors duration-fast",
                    badge.tone === "error"
                      ? "bg-state-error/15 text-state-error"
                      : badge.tone === "warn"
                        ? "bg-state-warn/15 text-state-warn"
                        : active
                          ? "bg-skope-accent/18 text-skope-accent"
                          : "bg-surface-track text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  {badge.value}
                  {badge.srLabel && (
                    <span className="sr-only"> {badge.srLabel}</span>
                  )}
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
  )
}
