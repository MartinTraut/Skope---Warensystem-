"use client"

/* eslint-disable @next/next/no-img-element -- Marken-Asset mit fester
   Bilddatei; next/image bringt hier keinen Vorteil und erschwert den
   Vorab-Ladecheck. */

import { useMemo, useSyncExternalStore } from "react"

import {
  getLogoServerState,
  getLogoState,
  subscribeToLogo,
} from "@/lib/brand/logo-probe"
import { cn } from "@/lib/utils"

/**
 * Das originale SKOPE-Logo.
 *
 * Zwei Fassungen derselben Marke:
 *  - `skope-logo.png`   — vollständige Lockup (Scooter über Wortmarke)
 *  - `skope-signet.png` — nur das Scooter-Signet, für die eingeklappte Sidebar
 *
 * Beide sind Ausschnitte des gelieferten Originals, freigestellt vor
 * transparentem Hintergrund. Farben, Formen und Proportionen sind unverändert.
 *
 * Liegt eine Datei nicht vor, erscheint an derselben Stelle und in derselben
 * Größe ein Platzhalter — die Oberfläche bleibt dadurch intakt.
 */

const LOGO_SRC = "/brand/skope-logo.png"
const SIGNET_SRC = "/brand/skope-signet.png"

interface SkopeLogoProps {
  className?: string
  /** Höhe in Pixeln. Die Breite ergibt sich aus dem Seitenverhältnis. */
  height?: number
  /** Nur das Signet zeigen (eingeklappte Sidebar). */
  compact?: boolean
}

export function SkopeLogo({
  className,
  height = 40,
  compact = false,
}: SkopeLogoProps) {
  const src = compact ? SIGNET_SRC : LOGO_SRC

  const subscribe = useMemo(() => subscribeToLogo(src), [src])
  const getSnapshot = useMemo(() => getLogoState(src), [src])
  const state = useSyncExternalStore(subscribe, getSnapshot, getLogoServerState)

  if (state === "vorhanden") {
    return (
      <img
        src={src}
        alt="SKOPE"
        style={{ height }}
        /*
          `max-w-full` ist hier nicht kosmetisch: In der eingeklappten
          Navigation ist das Signet breiter als die Spalte und lief sonst
          über die Trennkante hinaus.
        */
        className={cn(
          "w-auto max-w-full object-contain select-none",
          className
        )}
        draggable={false}
      />
    )
  }

  // Während der Prüfung wird der Platzhalter unsichtbar gehalten: Er belegt
  // bereits den Raum, springt beim Wechsel also nicht.
  return (
    <LogoPlaceholder
      height={height}
      compact={compact}
      className={className}
      pending={state === "pruefend"}
    />
  )
}

function LogoPlaceholder({
  height,
  compact,
  className,
  pending,
}: {
  height: number
  compact: boolean
  className?: string
  pending: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 select-none",
        pending && "opacity-0",
        className
      )}
      style={{ height }}
      title="Platzhalter — Logodatei unter /public/brand/ ablegen"
    >
      <div
        className="grid shrink-0 place-items-center rounded-md border border-dashed border-skope-accent/45 bg-skope-accent/8"
        style={{ height, width: height }}
        aria-hidden
      >
        <span
          className="font-medium text-skope-accent"
          style={{ fontSize: height * 0.46, letterSpacing: "-0.02em" }}
        >
          S
        </span>
      </div>
      {!compact && (
        <span
          className="font-medium tracking-[0.22em] text-foreground/85"
          style={{ fontSize: height * 0.4 }}
        >
          SKOPE
        </span>
      )}
    </div>
  )
}
