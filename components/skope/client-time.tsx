"use client"

import { useHydrated } from "@/hooks/use-cockpit"
import {
  formatDate,
  formatDateTime,
  formatRelative,
} from "@/lib/domain/money"

/**
 * Zeitangaben, die erst nach dem Hydrieren erscheinen.
 *
 * Jede Ausgabe, die sich auf „jetzt" bezieht, unterscheidet sich zwangsläufig
 * zwischen Server- und Client-Render — das erzeugt sonst eine
 * Hydration-Diskrepanz und React verwirft den betroffenen Teilbaum. Bis die
 * Daten geladen sind, steht deshalb ein Platzhalter gleicher Breite.
 */

function Placeholder() {
  return (
    <span
      className="inline-block h-3 w-16 animate-pulse rounded bg-surface-raised align-middle"
      aria-hidden
    />
  )
}

export function RelativeTime({ iso }: { iso: string | null | undefined }) {
  const hydrated = useHydrated()
  if (!hydrated) return <Placeholder />
  return <>{formatRelative(iso)}</>
}

export function DateTimeText({ iso }: { iso: string | null | undefined }) {
  const hydrated = useHydrated()
  if (!hydrated) return <Placeholder />
  return <>{formatDateTime(iso)}</>
}

export function DateText({ iso }: { iso: string | null | undefined }) {
  const hydrated = useHydrated()
  if (!hydrated) return <Placeholder />
  return <>{formatDate(iso)}</>
}
