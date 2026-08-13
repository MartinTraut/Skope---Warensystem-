"use client"

import { useRouter } from "next/navigation"
import type { MouseEvent } from "react"

/**
 * Ganze Tabellenzeile als Ziel.
 *
 * Ein Link nur auf der Scooter-Nummer trifft man am Tablet kaum und am
 * Desktop nicht dort, wo man hinsieht — geklickt wird die Zeile. Der Link im
 * Inneren bleibt bestehen: er trägt Tastaturbedienung, Mittelklick und
 * "Link kopieren", die ein `onClick` allein nicht abbildet.
 */
export function useRowNavigation() {
  const router = useRouter()

  return function open(href: string, event: MouseEvent<HTMLElement>) {
    // Klick auf ein echtes Bedienelement in der Zeile (Link, Wiederholen-Knopf)
    // gehört diesem Element, nicht der Navigation.
    const target = event.target as HTMLElement
    if (target.closest("a, button, input, select, label")) return

    // Wer Text markiert, will lesen und nicht springen.
    if (window.getSelection()?.toString()) return

    if (event.metaKey || event.ctrlKey) {
      window.open(href, "_blank", "noopener")
      return
    }
    router.push(href)
  }
}
