"use client"

/**
 * Prüft je Bildquelle einmal pro Sitzung, ob die Datei vorhanden ist.
 *
 * Ein `onError` direkt am <img> reicht nicht: Der Ladefehler tritt bereits
 * während des Hydrierens auf, bevor React den Handler angehängt hat — das
 * kaputte Bildsymbol bliebe sichtbar. Deshalb wird die Datei vorab per
 * JavaScript geladen und erst danach angezeigt.
 */

export type LogoState = "pruefend" | "vorhanden" | "fehlt"

const states = new Map<string, LogoState>()
const listeners = new Map<string, Set<() => void>>()

function listenersFor(src: string) {
  let set = listeners.get(src)
  if (!set) {
    set = new Set()
    listeners.set(src, set)
  }
  return set
}

function start(src: string) {
  if (states.has(src)) return
  states.set(src, "pruefend")

  const image = new Image()
  image.onload = () => {
    states.set(src, "vorhanden")
    for (const listener of listenersFor(src)) listener()
  }
  image.onerror = () => {
    states.set(src, "fehlt")
    for (const listener of listenersFor(src)) listener()
  }
  image.src = src
}

export function subscribeToLogo(src: string) {
  return (listener: () => void) => {
    listenersFor(src).add(listener)
    start(src)
    return () => {
      listenersFor(src).delete(listener)
    }
  }
}

export function getLogoState(src: string) {
  return () => states.get(src) ?? "pruefend"
}

/** Auf dem Server ist nichts prüfbar — dort gilt immer "wird geprüft". */
export function getLogoServerState(): LogoState {
  return "pruefend"
}
