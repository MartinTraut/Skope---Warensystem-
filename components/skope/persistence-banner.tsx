"use client"

import { AlertTriangle } from "lucide-react"
import Link from "next/link"
import { useSyncExternalStore } from "react"

import {
  getPersistenceProblem,
  getPersistenceProblemServer,
  subscribeToPersistenceProblem,
} from "@/lib/store/persistence-status"

/**
 * Dauerhafter Hinweis, wenn der Browser nicht mehr speichern kann.
 *
 * Ohne diesen Streifen wäre der häufigste Datenverlust des Prototyps
 * unsichtbar: Der Bildschirm zeigt die Eingabe, der Speicher hat sie nicht.
 */
export function PersistenceBanner() {
  const problem = useSyncExternalStore(
    subscribeToPersistenceProblem,
    getPersistenceProblem,
    getPersistenceProblemServer
  )

  if (!problem) return null

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-state-error/30 bg-state-error/10 px-4 py-2.5 sm:px-6"
    >
      <AlertTriangle className="size-4 shrink-0 text-state-error" aria-hidden />
      <p className="min-w-0 flex-1 type-body-sm text-foreground/90">
        {problem.message}
      </p>
      <Link
        href="/settings"
        className="rounded-md border border-state-error/35 px-2.5 py-1 text-xs font-medium text-state-error transition-colors hover:bg-state-error/10 focus-visible:ring-3 focus-visible:ring-state-error/25 focus-visible:outline-none"
      >
        Daten sichern
      </Link>
    </div>
  )
}
