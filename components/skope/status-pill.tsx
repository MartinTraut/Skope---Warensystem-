import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import type { StatusTone } from "@/lib/domain/status"

/**
 * Einheitliche Statusdarstellung.
 *
 * Genau eine Komponente für alle Status im System — dadurch bedeutet dieselbe
 * Farbe überall dasselbe. Gold ist ausschließlich für laufende Vorgänge
 * reserviert und wird nicht dekorativ verteilt.
 */

/*
 * Kräftiger als zuvor: Fläche und Rand tragen jetzt genug Farbe, dass ein
 * Status über eine ganze Tabellenspalte hinweg auffällt. Vorher lagen alle
 * Abzeichen bei 10 % Deckung und wirkten aus der Entfernung gleich grau.
 */
const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "border-white/12 bg-surface-raised text-muted-foreground",
  info: "border-state-info/45 bg-state-info/18 text-state-info",
  progress: "border-skope-gold/50 bg-skope-gold/18 text-skope-gold",
  ready: "border-state-ready/45 bg-state-ready/18 text-state-ready",
  live: "border-state-live/45 bg-state-live/18 text-state-live",
  warn: "border-state-warn/45 bg-state-warn/18 text-state-warn",
  error: "border-state-error/50 bg-state-error/20 text-state-error",
  done: "border-state-done/45 bg-state-done/18 text-state-done",
}

const DOT_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-state-info",
  progress: "bg-skope-gold",
  ready: "bg-state-ready",
  live: "bg-state-live",
  warn: "bg-state-warn",
  error: "bg-state-error",
  done: "bg-state-done",
}

interface StatusPillProps {
  tone: StatusTone
  children: ReactNode
  /** Punkt links — kennzeichnet Zustände, nicht Kategorien. */
  dot?: boolean
  /** Punkt pulsiert: laufender Vorgang. */
  pulse?: boolean
  size?: "sm" | "md"
  className?: string
}

export function StatusPill({
  tone,
  children,
  dot = true,
  pulse = false,
  size = "md",
  className,
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 type-caption" : "px-2.5 py-1 text-xs",
        TONE_CLASSES[tone],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            DOT_CLASSES[tone],
            pulse && "animate-pulse-soft"
          )}
          aria-hidden
        />
      )}
      {children}
    </span>
  )
}
