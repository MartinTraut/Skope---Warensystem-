"use client"

import { AlertTriangle, RotateCcw } from "lucide-react"
import Link from "next/link"

import { Button, buttonVariants } from "@/components/ui/button"

/**
 * Auffangnetz innerhalb der Cockpit-Shell.
 *
 * Ohne diese Grenze reißt jeder Fehler in einer der Ansichten die gesamte
 * Anwendung auf die weiße Standardseite — am Werkstatt-Tablet heißt das:
 * Arbeitsstand weg, kein Hinweis, was zu tun ist. Die Navigation bleibt hier
 * erhalten, der Rest der Anwendung ist weiter bedienbar.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="skope-panel rounded-xl p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-state-error/30 bg-state-error/10">
            <AlertTriangle className="size-5 text-state-error" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="type-section text-foreground">
              Diese Ansicht konnte nicht geladen werden
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Der Fehler betrifft nur den Inhaltsbereich. Deine gespeicherten
              Daten sind davon nicht betroffen — Navigation und andere Bereiche
              funktionieren weiter.
            </p>
          </div>
        </div>

        <pre className="mt-5 overflow-x-auto rounded-lg border border-skope-line bg-black/30 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
          {error.message}
          {error.digest && `\n\nKennung: ${error.digest}`}
        </pre>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button className="h-11 gap-2 px-4" onClick={reset}>
            <RotateCcw className="size-4" />
            Erneut versuchen
          </Button>
          <Link
            href="/dashboard"
            className={buttonVariants({
              variant: "outline",
              className: "h-11 px-4",
            })}
          >
            Zum Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
