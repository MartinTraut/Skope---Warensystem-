"use client"

import { useMemo } from "react"

import {
  barcodeRects,
  barcodeWidth,
  encodeCode128,
} from "@/lib/domain/barcode"
import { cn } from "@/lib/utils"

/**
 * Strichcode als SVG.
 *
 * SVG statt Bild, weil Etiketten gedruckt werden: Ein Raster mit 96 dpi wird
 * auf Papier unscharf, und ein unscharfer Strichcode ist einer, den der
 * Scanner nicht liest. Die Balken sind immer schwarz auf weiß — auch in der
 * dunklen Oberfläche —, weil jeder Scanner den Kontrast in dieser Richtung
 * erwartet.
 */
export function Barcode({
  value,
  height = 44,
  moduleWidth = 2,
  showText = true,
  className,
}: {
  value: string
  /** Höhe der Balken in Pixeln. */
  height?: number
  /** Breite eines Moduls. Unter 2 px wird es beim Drucken kritisch. */
  moduleWidth?: number
  showText?: boolean
  className?: string
}) {
  const { rects, width } = useMemo(() => {
    const barcode = encodeCode128(value)
    return { rects: barcodeRects(barcode), width: barcodeWidth(barcode) }
  }, [value])

  if (!value) return null

  return (
    <div className={cn("flex w-full flex-col items-center bg-white", className)}>
      {/*
        Feste Breite als Wunsch, `max-w-full` als Grenze: Das Etikett soll so
        breit werden, wie die Module es verlangen — aber niemals über seine
        Karte hinauslaufen. Beim Verkleinern schrumpfen alle Module im selben
        Verhältnis, die Kodierung bleibt lesbar.
      */}
      <svg
        role="img"
        aria-label={`Strichcode ${value}`}
        className="h-auto w-full max-w-full"
        width={width * moduleWidth}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
      >
        <rect width={width} height={height} fill="#ffffff" />
        {rects.map((rect, index) => (
          <rect
            key={index}
            x={rect.x}
            y={0}
            width={rect.width}
            height={height}
            fill="#000000"
          />
        ))}
      </svg>
      {showText && (
        <span className="pb-0.5 font-mono text-[10px] tracking-[0.18em] text-black">
          {value}
        </span>
      )}
    </div>
  )
}
