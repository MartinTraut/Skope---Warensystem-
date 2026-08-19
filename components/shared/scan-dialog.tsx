"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ScanLine } from "lucide-react"

import { Modal } from "@/components/skope/modal"
import { Button } from "@/components/ui/button"
import { useArticles, useUnits } from "@/hooks/use-cockpit"
import { articleLabel, unitLabel } from "@/lib/domain/article-factory"
import { normalizeReference } from "@/lib/domain/numbering"

/**
 * Scannen und springen.
 *
 * Ein Handscanner ist für den Rechner eine Tastatur: Er tippt den Inhalt des
 * Strichcodes und schickt ein Enter hinterher. Es braucht also keine
 * Geräteanbindung, nur ein Feld, das zuhört und weiß, wonach es sucht.
 *
 * Gesucht wird über alle Nummern, die auf einem Etikett stehen können —
 * Stücknummer, Seriennummer, Artikelnummer, EAN, Teilenummer — und
 * normalisiert, weil ein Scanner Bindestriche liefert, wo im System keine
 * stehen (und umgekehrt).
 *
 * Bei genau einem Treffer springt die Ansicht sofort dorthin. Das ist der
 * eigentliche Gewinn: Karton in die Hand, piep, richtiger Datensatz.
 */
export function ScanDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const units = useUnits()
  const articles = useArticles()
  const [code, setCode] = useState("")
  const [miss, setMiss] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /*
    Der Scanner tippt sofort los, sobald der Dialog offen ist — ohne Fokus im
    Feld landet der Code im Nichts. Geleert wird beim Schließen, nicht beim
    Öffnen: Sonst blinkt der letzte Code beim Aufziehen noch einmal auf.
  */
  useEffect(() => {
    if (!open) return
    // Ein Bild später, damit das Feld im Dokument steht.
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  const matches = useMemo(() => {
    const needle = normalizeReference(code)
    if (!needle) return []

    const unitHits = units
      .filter(
        (unit) =>
          normalizeReference(unit.unitNumber) === needle ||
          (unit.serialNumber && normalizeReference(unit.serialNumber) === needle)
      )
      .map((unit) => {
        const article = articles.find((entry) => entry.id === unit.articleId)
        return {
          href: `/units/${unit.id}`,
          label: article ? unitLabel(article, unit) : unit.unitNumber,
          number: unit.unitNumber,
          hint: unit.serialNumber,
        }
      })

    const articleHits = articles
      .filter(
        (article) =>
          normalizeReference(article.sku) === needle ||
          (article.ean && normalizeReference(article.ean) === needle) ||
          (article.mpn && normalizeReference(article.mpn) === needle)
      )
      .map((article) => ({
        href: `/inventory/${article.id}`,
        label: articleLabel(article),
        number: article.sku,
        hint: article.mpn || article.ean,
      }))

    return [...unitHits, ...articleHits]
  }, [code, units, articles])

  function submit() {
    if (matches.length === 1) {
      onOpenChange(false)
      router.push(matches[0].href)
      return
    }
    if (matches.length === 0 && code.trim()) {
      // Kein Treffer wird benannt, nicht verschwiegen: Sonst steht man vor
      // einem Feld, das auf jeden Scan gleich reagiert — nämlich gar nicht.
      setMiss(code.trim())
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCode("")
          setMiss(null)
        }
        onOpenChange(next)
      }}
      title="Scannen"
      description="Handscanner auf den Code halten oder Nummer eintippen."
      size="sm"
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
          <Button size="lg" onClick={submit} disabled={matches.length !== 1}>
            Öffnen
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <ScanLine className="pointer-events-none absolute inset-y-0 left-3 my-auto size-5 text-skope-accent" />
          <input
            ref={inputRef}
            aria-label="Code"
            className="h-14 w-full rounded-lg border border-skope-line-strong bg-surface-input pr-3 pl-11 font-mono text-lg tracking-widest text-foreground outline-none focus:border-skope-accent/60 focus:ring-3 focus:ring-skope-accent/15"
            placeholder="SK-2026-0042"
            value={code}
            onChange={(event) => {
              setCode(event.target.value)
              setMiss(null)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                submit()
              }
            }}
          />
        </div>

        {matches.length > 0 ? (
          <ul className="divide-y divide-skope-line rounded-lg border border-skope-line">
            {matches.map((match) => (
              <li key={match.href}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken"
                  onClick={() => {
                    onOpenChange(false)
                    router.push(match.href)
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">
                      {match.label}
                    </span>
                    <span className="block truncate font-mono type-micro text-muted-foreground">
                      {match.number}
                      {match.hint ? ` · ${match.hint}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : miss ? (
          <p className="rounded-lg border border-state-error/30 bg-state-error/5 px-3 py-2.5 text-sm text-state-error">
            Zu {"„"}
            {miss}
            {"“"} gibt es weder ein Gerät noch einen Artikel. Stimmt der
            Bereich, oder ist die Ware noch nicht erfasst?
          </p>
        ) : (
          <p className="type-caption text-muted-foreground">
            Gesucht wird über Stücknummer, Seriennummer, Artikelnummer, EAN und
            Teilenummer. Bindestriche und Leerzeichen sind dabei egal.
          </p>
        )}
      </div>
    </Modal>
  )
}
