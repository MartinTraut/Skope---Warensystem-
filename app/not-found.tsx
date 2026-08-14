import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

export const metadata = { title: "Seite nicht gefunden" }

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center px-6">
      <div className="max-w-lg text-center">
        <p className="type-label text-skope-accent">Fehler 404</p>
        <h1 className="type-page-title mt-3 text-foreground">
          Diese Seite gibt es nicht
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Der aufgerufene Pfad gehört zu keinem Bereich des Cockpits. Möglich
          ist auch, dass ein Scooter zwischenzeitlich entfernt wurde.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/dashboard"
            className={buttonVariants({ className: "h-11 px-4" })}
          >
            Zum Dashboard
          </Link>
          <Link
            href="/scooters"
            className={buttonVariants({
              variant: "outline",
              className: "h-11 px-4",
            })}
          >
            Zum Bestand
          </Link>
        </div>
      </div>
    </main>
  )
}
