/**
 * Zustand der Persistenzschicht — sichtbar für die Oberfläche.
 *
 * Der localStorage ist kein verlässlicher Speicher: Er ist auf wenige
 * Megabyte begrenzt, im privaten Modus mancher Browser gesperrt und kann
 * mitten in einem Schreibvorgang abbrechen. Ohne diese Meldung würde ein
 * solcher Abbruch stumm bleiben — der Mitarbeiter sähe seine Eingabe auf dem
 * Bildschirm, hätte sie aber nicht gespeichert.
 *
 * Deshalb wird jeder Schreibfehler hier festgehalten und im App-Rahmen als
 * dauerhafter Hinweis ausgegeben, bis er behoben ist.
 */

export type PersistenceProblem =
  | { kind: "quota"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "read"; message: string }

let current: PersistenceProblem | null = null
const listeners = new Set<() => void>()

export function reportPersistenceProblem(problem: PersistenceProblem) {
  // Nur der erste Fehler zählt: Danach schlägt jeder weitere Schreibvorgang
  // ohnehin fehl, und ein flackernder Hinweis hilft niemandem.
  if (current?.kind === problem.kind) return
  current = problem
  for (const listener of listeners) listener()
}

export function clearPersistenceProblem() {
  if (current === null) return
  current = null
  for (const listener of listeners) listener()
}

export function getPersistenceProblem(): PersistenceProblem | null {
  return current
}

/** Auf dem Server gibt es keinen Speicher und damit auch kein Problem. */
export function getPersistenceProblemServer(): PersistenceProblem | null {
  return null
}

export function subscribeToPersistenceProblem(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * localStorage mit Fehlerbehandlung.
 *
 * Ohne diese Hülle wirft `setItem` bei vollem Speicher mitten aus einer
 * Zustandsänderung heraus. Im Verkaufspfad läge der Scooter dann bereits auf
 * VERKAUFT, während der zugehörige Verkaufsdatensatz nie geschrieben würde.
 */
export function createGuardedStorage(): Storage {
  if (typeof window === "undefined") return memoryStorage()

  let backing: Storage
  try {
    backing = window.localStorage
    // Zugriff allein reicht nicht — in manchen Browsern wirft erst der
    // Schreibvorgang.
    const probe = "__skope_probe__"
    backing.setItem(probe, "1")
    backing.removeItem(probe)
  } catch {
    reportPersistenceProblem({
      kind: "unavailable",
      message:
        "Der Browser lässt kein lokales Speichern zu (z. B. privater Modus). " +
        "Eingaben gehen beim Neuladen verloren.",
    })
    // Die Anwendung läuft weiter, nur eben ohne Dauerhaftigkeit — mit
    // sichtbarem Hinweis statt eines Absturzes beim ersten Schreibversuch.
    return memoryStorage()
  }

  return {
    get length() {
      return backing.length
    },
    key: (index) => backing.key(index),
    clear: () => backing.clear(),
    removeItem: (key) => backing.removeItem(key),
    getItem: (key) => {
      try {
        return backing.getItem(key)
      } catch (error) {
        reportPersistenceProblem({
          kind: "read",
          message:
            "Der gespeicherte Stand konnte nicht gelesen werden: " +
            describe(error),
        })
        return null
      }
    },
    setItem: (key, value) => {
      try {
        backing.setItem(key, value)
        clearPersistenceProblem()
      } catch (error) {
        reportPersistenceProblem({
          kind: "quota",
          message:
            "Der lokale Speicher ist voll. Änderungen werden nicht mehr gesichert. " +
            "Bitte Daten exportieren und Bilder reduzieren.",
        })
        // Bewusst nicht weiterwerfen: Der Fehler darf keine laufende
        // Geschäftsoperation in der Mitte abbrechen.
        void error
      }
    },
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Ersatzspeicher ohne Dauerhaftigkeit — hält die Anwendung lauffähig. */
function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    key: (index) => [...map.keys()][index] ?? null,
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    removeItem: (key) => {
      map.delete(key)
    },
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}
