/**
 * Anlegen neuer Scooter und Vergabe der sichtbaren Scooter-Nummer.
 *
 * Im Prototyp wird die laufende Nummer aus dem vorhandenen Bestand abgeleitet.
 * In der Produktion übernimmt das eine Postgres-Sequenz in derselben
 * Transaktion wie das INSERT — `nextScooterNumber` ist dann die einzige Stelle,
 * die ersetzt werden muss. Ein `MAX()+1` im Anwendungscode wäre dort falsch,
 * weil parallele Importe dieselbe Nummer ziehen könnten.
 */

import { createEmptyInspection } from "./inspection"
import type { Channel, Listing, Scooter } from "./types"
import { CHANNELS } from "./types"

export function createId(prefix = "id"): string {
  // crypto.randomUUID ist in allen Zielbrowsern verfügbar; der Fallback
  // greift nur in exotischen Umgebungen ohne Secure Context.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

const NUMBER_PATTERN = /^SK-(\d{4})-(\d{4})$/

/**
 * Ermittelt die nächste freie Nummer für das laufende Jahr.
 * Nummern anderer Jahre werden ignoriert, der Zähler startet jährlich neu.
 */
export function nextScooterNumber(
  existing: string[],
  year: number = new Date().getFullYear()
): string {
  const highest = existing.reduce((max, number) => {
    const match = NUMBER_PATTERN.exec(number)
    if (!match) return max
    if (Number.parseInt(match[1], 10) !== year) return max
    return Math.max(max, Number.parseInt(match[2], 10))
  }, 0)

  return `SK-${year}-${String(highest + 1).padStart(4, "0")}`
}

/** Reserviert mehrere Nummern am Stück — für den Import. */
export function nextScooterNumbers(
  existing: string[],
  count: number,
  year: number = new Date().getFullYear()
): string[] {
  const pool = [...existing]
  const result: string[] = []
  for (let index = 0; index < count; index += 1) {
    const number = nextScooterNumber(pool, year)
    pool.push(number)
    result.push(number)
  }
  return result
}

export function createEmptyListing(channel: Channel): Listing {
  return {
    channel,
    status: "NICHT_VEROEFFENTLICHT",
    externalIds: {},
    externalUrl: null,
    priceCents: null,
    inventory: 0,
    lastSyncedAt: null,
    lastError: null,
    retryCount: 0,
  }
}

export type NewScooterInput = Partial<
  Pick<
    Scooter,
    | "serialNumber"
    | "manufacturer"
    | "model"
    | "variant"
    | "color"
    | "mileageKm"
    | "condition"
    | "description"
    | "technicalData"
    | "purchasePriceCents"
    | "additionalCostsCents"
    | "salePriceCents"
    | "purchaseDate"
    | "arrivalDate"
    | "location"
    | "notes"
    | "documents"
    | "importBatchId"
  >
>

/**
 * Erzeugt einen vollständigen, konsistenten Scooter-Datensatz.
 * Jeder neue Scooter startet in EINGEGANGEN / VERFUEGBAR mit leerem
 * Prüfprotokoll und Listings auf allen bekannten Kanälen.
 */
export function createScooter(
  input: NewScooterInput,
  scooterNumber: string
): Scooter {
  const now = new Date().toISOString()

  return {
    id: createId("sct"),
    scooterNumber,
    serialNumber: input.serialNumber?.trim() ?? "",
    manufacturer: input.manufacturer?.trim() ?? "",
    model: input.model?.trim() ?? "",
    variant: input.variant?.trim() ?? "",
    color: input.color?.trim() ?? "",
    mileageKm: input.mileageKm ?? 0,
    condition: input.condition ?? "GEBRAUCHT",
    description: input.description ?? "",
    technicalData: input.technicalData ?? [],
    purchasePriceCents: input.purchasePriceCents ?? 0,
    additionalCostsCents: input.additionalCostsCents ?? 0,
    salePriceCents: input.salePriceCents ?? null,
    purchaseDate: input.purchaseDate ?? now,
    arrivalDate: input.arrivalDate ?? now,
    location: input.location ?? "Wareneingang",
    notes: input.notes ?? "",
    workflowStatus: "EINGEGANGEN",
    saleStatus: "VERFUEGBAR",
    documents: input.documents ?? {
      abe: false,
      invoice: false,
      other: false,
      note: "",
    },
    inspection: createEmptyInspection(),
    cleaning: { done: false, doneAt: null, note: "" },
    repairs: [],
    images: [],
    listings: CHANNELS.map(createEmptyListing),
    importBatchId: input.importBatchId ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

/** Dubletten-Erkennung: gleiche Seriennummer, unabhängig von Schreibweise. */
export function normalizeSerial(serial: string): string {
  return serial.replace(/\s+/g, "").toUpperCase()
}

export function findBySerial(scooters: Scooter[], serial: string) {
  const normalized = normalizeSerial(serial)
  if (!normalized) return undefined
  return scooters.find(
    (scooter) => normalizeSerial(scooter.serialNumber) === normalized
  )
}
