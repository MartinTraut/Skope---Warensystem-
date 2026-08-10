/**
 * Definition der Prüfpunkte.
 *
 * Bewusst als Datenliste und nicht als feste Felder: Kommt ein Prüfpunkt
 * hinzu, ist das eine Zeile hier und später ein Eintrag in einer
 * Konfigurationstabelle — kein Schema-Umbau.
 */

import type {
  InspectionCheckDefinition,
  InspectionRecord,
  Scooter,
} from "./types"

export const INSPECTION_CHECKS: InspectionCheckDefinition[] = [
  { key: "visual", label: "Sichtprüfung", critical: true, group: "Mechanik" },
  { key: "brake_front", label: "Bremse vorne", critical: true, group: "Mechanik" },
  { key: "brake_rear", label: "Bremse hinten", critical: true, group: "Mechanik" },
  { key: "tire_front", label: "Reifen vorne", critical: true, group: "Mechanik" },
  { key: "tire_rear", label: "Reifen hinten", critical: true, group: "Mechanik" },
  { key: "lights", label: "Beleuchtung", critical: true, group: "Elektrik" },
  { key: "battery", label: "Akku", critical: true, group: "Elektrik" },
  { key: "charger", label: "Ladegerät", critical: false, group: "Elektrik" },
  { key: "display", label: "Display", critical: false, group: "Elektrik" },
  { key: "electronics", label: "Elektronik", critical: true, group: "Elektrik" },
  { key: "test_ride", label: "Testfahrt", critical: true, group: "Fahrbetrieb" },
  { key: "papers", label: "ABE / Papiere", critical: true, group: "Dokumente" },
]

export const INSPECTION_GROUPS = [
  "Mechanik",
  "Elektrik",
  "Fahrbetrieb",
  "Dokumente",
] as const

export function createEmptyInspection(): InspectionRecord {
  return {
    checks: INSPECTION_CHECKS.map((definition) => ({
      key: definition.key,
      result: "NICHT_GEPRUEFT" as const,
      note: "",
    })),
    completedAt: null,
    completedBy: null,
    note: "",
  }
}

export function getCheckDefinition(key: string) {
  return INSPECTION_CHECKS.find((definition) => definition.key === key)
}

export interface InspectionProgress {
  total: number
  checked: number
  passed: number
  problems: number
  /** 0–100, für die Fortschrittsanzeige. */
  percent: number
  /** Alle Punkte berührt — Voraussetzung fürs Abschließen. */
  complete: boolean
}

export function getInspectionProgress(
  inspection: InspectionRecord
): InspectionProgress {
  const total = inspection.checks.length
  const checked = inspection.checks.filter(
    (check) => check.result !== "NICHT_GEPRUEFT"
  ).length
  const passed = inspection.checks.filter(
    (check) => check.result === "BESTANDEN"
  ).length
  const problems = inspection.checks.filter(
    (check) => check.result === "PROBLEM"
  ).length

  return {
    total,
    checked,
    passed,
    problems,
    percent: total === 0 ? 0 : Math.round((checked / total) * 100),
    complete: checked === total,
  }
}

/** Prüfpunkte mit Problem — Grundlage für "Reparatur erforderlich". */
export function getProblemChecks(scooter: Scooter) {
  return scooter.inspection.checks
    .filter((check) => check.result === "PROBLEM")
    .map((check) => ({
      ...check,
      definition: getCheckDefinition(check.key),
    }))
}
