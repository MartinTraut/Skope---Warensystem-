"use client"

import { useState } from "react"
import { Printer } from "lucide-react"

import { Barcode } from "@/components/shared/barcode"
import { InlineSelect } from "@/components/skope/form"
import { Modal } from "@/components/skope/modal"
import { Button } from "@/components/ui/button"

/**
 * Etiketten drucken.
 *
 * Der fehlende Schritt zwischen Bildschirm und Regal: Ohne Etikett steht am
 * Fach nichts, was das System kennt — die Zuordnung lebt im Kopf desjenigen,
 * der eingeräumt hat. Mit Etikett führt jeder Karton seine Nummer mit sich,
 * und der Handscanner bringt sie zurück ins System, ohne dass jemand tippt.
 *
 * Gedruckt wird über die Druckfunktion des Browsers auf gewöhnliche
 * Etikettenbögen. Kein Treiber, keine Etikettendrucker-Anbindung: Der Betrieb
 * hat einen Drucker, und der druckt Papier.
 */
export function LabelDialog({
  open,
  onOpenChange,
  title,
  lines,
  code,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Überschrift des Etiketts — Modell oder Artikelbezeichnung. */
  title: string
  /** Zusatzzeilen: Seriennummer, Lagerplatz, Zustand. */
  lines: string[]
  /** Was der Scanner liest: Stück- oder Artikelnummer. */
  code: string
}) {
  const [count, setCount] = useState("1")

  const copies = Number.parseInt(count, 10) || 1

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Etikett drucken"
      description={code}
      size="lg"
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
          <Button size="lg" onClick={() => window.print()}>
            <Printer className="size-4" />
            Drucken
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <label className="type-body-sm text-muted-foreground" htmlFor="label-count">
            Anzahl
          </label>
          <InlineSelect
            id="label-count"
            className="w-28"
            value={count}
            onChange={(event) => setCount(event.target.value)}
            options={["1", "2", "4", "8", "12", "24"].map((value) => ({
              value,
              label: `${value}×`,
            }))}
          />
          <p className="type-caption text-muted-foreground">
            Der Druck enthält nur die Etiketten, nicht die Oberfläche.
          </p>
        </div>

        {/*
          Der Etikettenbogen ist zugleich Vorschau und Druckvorlage. Zwei
          getrennte Darstellungen wären zwei Stellen, an denen sich ein
          Fehler einschleicht — was auf dem Bildschirm steht, kommt aus dem
          Drucker.
        */}
        <div
          id="skope-label-sheet"
          className="grid grid-cols-1 gap-3 rounded-xl border border-skope-line bg-white p-3 sm:grid-cols-2"
        >
          {Array.from({ length: copies }, (_, index) => (
            <div
              key={index}
              className="flex break-inside-avoid flex-col items-center gap-1 rounded-md border border-dashed border-black/25 px-2 py-2.5"
            >
              <p className="w-full truncate text-center text-[11px] leading-tight font-medium text-black">
                {title}
              </p>
              {lines.filter(Boolean).map((line) => (
                <p
                  key={line}
                  className="w-full truncate text-center text-[9px] leading-tight text-black/70"
                >
                  {line}
                </p>
              ))}
              <Barcode value={code} height={38} moduleWidth={1.6} />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
