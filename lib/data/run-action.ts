"use client"

import { toast } from "sonner"

import type { ActionResult } from "./repository"

/**
 * Führt eine schreibende Aktion aus und meldet das Ergebnis ehrlich.
 *
 * Der Grund für diesen Helfer: An mehreren Stellen wurde das `ActionResult`
 * verworfen und trotzdem ein Erfolgs-Toast gezeigt. Damit widersprach die
 * Oberfläche der Zusage des Systems, dass eine fehlgeschlagene Aktion nie als
 * erfolgreich dargestellt wird. Ein zentraler Aufrufpfad verhindert, dass das
 * Muster erneut auseinanderläuft.
 *
 * Rückgabe ist der Nutzdatensatz bei Erfolg, sonst `null` — so lässt sich am
 * Aufrufort kurz und gefahrlos weiterarbeiten.
 */
export async function runAction<T>(
  action: Promise<ActionResult<T>>,
  messages: {
    /** Erfolgsmeldung. Weglassen, wenn die Änderung für sich spricht. */
    success?: string
    /**
     * Zusatzzeile zur Erfolgsmeldung. Gedacht für Einschränkungen, die zur
     * Aussage gehören — etwa dass ein Kanal im Demo-Betrieb nichts sendet.
     */
    successDescription?: string
    /** Überschrift der Fehlermeldung; die Begründung liefert das Repository. */
    failure: string
  }
): Promise<T | null> {
  let result: ActionResult<T>
  try {
    result = await action
  } catch (error) {
    toast.error(messages.failure, {
      description: error instanceof Error ? error.message : String(error),
    })
    return null
  }

  if (!result.ok) {
    toast.error(messages.failure, { description: result.message })
    return null
  }

  if (messages.success) {
    toast.success(messages.success, {
      description: messages.successDescription,
    })
  }
  return result.data
}
