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

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "border-white/8 bg-white/4 text-muted-foreground",
  info: "border-state-info/25 bg-state-info/10 text-state-info",
  progress: "border-skope-gold/30 bg-skope-gold/10 text-skope-gold",
  ready: "border-state-ready/25 bg-state-ready/10 text-state-ready",
  live: "border-state-live/25 bg-state-live/10 text-state-live",
  warn: "border-state-warn/28 bg-state-warn/10 text-state-warn",
  error: "border-state-error/30 bg-state-error/12 text-state-error",
  done: "border-state-done/25 bg-state-done/10 text-state-done",
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
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
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
