/**
 * Demo-Datenbestand.
 *
 * Alle Datensätze sind erfunden — Seriennummern beginnen erkennbar mit "DEMO-".
 * Die Daten sind so gewählt, dass jede Stufe des Warenprozesses belegt ist und
 * die Kennzahlen auf dem Dashboard rechnerisch zusammenpassen.
 *
 * Der Seed ist deterministisch (bis auf die Zeitachse, die relativ zu heute
 * liegt), damit eine Demo beim Kunden zweimal gleich aussieht.
 */

import { createEmptyInspection } from "@/lib/domain/inspection"
import { repairCostsCents } from "@/lib/domain/metrics"
import { modelLabel } from "@/lib/domain/status"
import { createEmptyListing } from "@/lib/domain/scooter-factory"
import type {
  AuditEvent,
  Channel,
  Condition,
  ImportBatch,
  InspectionResult,
  Listing,
  Repair,
  Sale,
  SaleChannel,
  SaleStatus,
  Scooter,
  ScooterImage,
  WorkflowStatus,
} from "@/lib/domain/types"
import {
  createPlaceholderImage,
  placeholderViewLabel,
} from "./placeholder-image"

/* ------------------------------------------------------------------ */
/* Hilfsmittel                                                         */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000

function daysAgo(days: number, hour = 10, minute = 0): string {
  const date = new Date(Date.now() - days * DAY_MS)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

/** Verkaufsdatum innerhalb des laufenden Monats — für "Umsatz diesen Monat". */
function thisMonth(day: number, hour = 14): string {
  const now = new Date()
  const maxDay = Math.min(day, now.getDate())
  const date = new Date(now.getFullYear(), now.getMonth(), maxDay, hour, 0, 0, 0)
  return date.toISOString()
}

function lastMonth(day: number): string {
  const now = new Date()
  const date = new Date(now.getFullYear(), now.getMonth() - 1, day, 12, 0, 0, 0)
  return date.toISOString()
}

let idCounter = 0
function seedId(prefix: string): string {
  idCounter += 1
  return `${prefix}_seed_${String(idCounter).padStart(4, "0")}`
}

/* ------------------------------------------------------------------ */
/* Bausteine                                                           */
/* ------------------------------------------------------------------ */

function buildInspection(
  mode: "leer" | "teilweise" | "bestanden" | "mit_mangel",
  completedDaysAgo?: number
) {
  const inspection = createEmptyInspection()

  if (mode === "leer") return inspection

  if (mode === "teilweise") {
    inspection.checks = inspection.checks.map((check, index) => ({
      ...check,
      result: (index < 7 ? "BESTANDEN" : "NICHT_GEPRUEFT") as InspectionResult,
    }))
    return inspection
  }

  if (mode === "mit_mangel") {
    inspection.checks = inspection.checks.map((check) => ({
      ...check,
      result: (check.key === "tire_rear" || check.key === "brake_rear"
        ? "PROBLEM"
        : "BESTANDEN") as InspectionResult,
      note:
        check.key === "tire_rear"
          ? "Profil abgefahren, Riss in der Flanke."
          : check.key === "brake_rear"
            ? "Bremsbelag am Limit."
            : "",
    }))
    inspection.completedAt = daysAgo(completedDaysAgo ?? 3, 11, 20)
    inspection.completedBy = "M. Traut"
    inspection.note = "Zwei Mängel dokumentiert, Reparatur angelegt."
    return inspection
  }

  inspection.checks = inspection.checks.map((check) => ({
    ...check,
    result: "BESTANDEN" as InspectionResult,
    note: "",
  }))
  inspection.completedAt = daysAgo(completedDaysAgo ?? 5, 9, 40)
  inspection.completedBy = "M. Traut"
  return inspection
}

function buildImages(label: string, count: number, seed: number): ScooterImage[] {
  return Array.from({ length: count }, (_, index) => {
    const view = placeholderViewLabel(index)
    return {
      id: seedId("img"),
      url: createPlaceholderImage(label, view, seed + index),
      name: `${label} – ${view}`,
      isPrimary: index === 0,
      sortOrder: index,
      createdAt: daysAgo(6 - index),
    }
  })
}

function buildListing(
  channel: Channel,
  status: Listing["status"],
  priceCents: number | null,
  options: Partial<Listing> = {}
): Listing {
  const base = createEmptyListing(channel)
  return {
    ...base,
    status,
    priceCents,
    inventory: status === "VEROEFFENTLICHT" ? 1 : 0,
    lastSyncedAt: status === "NICHT_VEROEFFENTLICHT" ? null : daysAgo(1, 16, 12),
    externalIds:
      channel === "SHOPIFY" && status !== "NICHT_VEROEFFENTLICHT"
        ? {
            productId: `70${String(4_000_000 + idCounter * 7919).slice(0, 9)}`,
            variantId: `43${String(1_000_000 + idCounter * 6151).slice(0, 9)}`,
            inventoryItemId: `48${String(2_000_000 + idCounter * 3571).slice(0, 9)}`,
          }
        : {},
    externalUrl:
      channel === "SHOPIFY" && status !== "NICHT_VEROEFFENTLICHT"
        ? "https://demo-shop.myshopify.com/products/demo-scooter"
        : null,
    ...options,
  }
}

function repair(
  problem: string,
  action: string,
  sparePart: string,
  partCostCents: number,
  laborMinutes: number,
  status: Repair["status"],
  createdDaysAgo: number
): Repair {
  return {
    id: seedId("rep"),
    problem,
    action,
    sparePart,
    partCostCents,
    laborMinutes,
    status,
    createdAt: daysAgo(createdDaysAgo),
  }
}

/* ------------------------------------------------------------------ */
/* Scooter-Spezifikationen                                             */
/* ------------------------------------------------------------------ */

interface ScooterSpec {
  number: string
  serial: string
  manufacturer: string
  model: string
  variant: string
  color: string
  mileageKm: number
  condition: Condition
  purchaseCents: number
  saleCents: number | null
  additionalCents: number
  workflow: WorkflowStatus
  sale: SaleStatus
  location: string
  arrivalDaysAgo: number
  inspection: "leer" | "teilweise" | "bestanden" | "mit_mangel"
  cleaned: boolean
  repairs: Repair[]
  imageCount: number
  shopify: Listing["status"]
  kleinanzeigen: Listing["status"]
  abe: boolean
  invoice: boolean
  notes: string
}

const SPECS: ScooterSpec[] = [
  // --- Frisch eingegangen, noch nichts passiert ---------------------
  {
    number: "SK-2026-0041", serial: "DEMO-XM4U-77301", manufacturer: "Xiaomi",
    model: "Electric Scooter 4 Ultra", variant: "", color: "Schwarz",
    mileageKm: 412, condition: "SEHR_GUT", purchaseCents: 28900, saleCents: null,
    additionalCents: 0, workflow: "EINGEGANGEN", sale: "VERFUEGBAR",
    location: "Wareneingang", arrivalDaysAgo: 1, inspection: "leer",
    cleaned: false, repairs: [], imageCount: 0,
    shopify: "NICHT_VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "Retoure, Originalkarton vorhanden.",
  },
  {
    number: "SK-2026-0042", serial: "DEMO-NB-F2P-4482", manufacturer: "Segway-Ninebot",
    model: "KickScooter F2 Pro", variant: "", color: "Grau",
    mileageKm: 780, condition: "GUT", purchaseCents: 23150, saleCents: null,
    additionalCents: 0, workflow: "EINGEGANGEN", sale: "VERFUEGBAR",
    location: "Wareneingang", arrivalDaysAgo: 1, inspection: "leer",
    cleaned: false, repairs: [], imageCount: 0,
    shopify: "NICHT_VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: false, notes: "",
  },
  {
    number: "SK-2026-0043", serial: "DEMO-NIU-KQI3-9120", manufacturer: "NIU",
    model: "KQi3 Pro", variant: "", color: "Weiß",
    mileageKm: 1240, condition: "GUT", purchaseCents: 25500, saleCents: null,
    additionalCents: 0, workflow: "EINGEGANGEN", sale: "VERFUEGBAR",
    location: "Wareneingang", arrivalDaysAgo: 2, inspection: "leer",
    cleaned: false, repairs: [], imageCount: 0,
    shopify: "NICHT_VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: false, invoice: true, notes: "ABE fehlt — beim Lieferanten nachfordern.",
  },

  // --- In Prüfung --------------------------------------------------
  {
    number: "SK-2026-0038", serial: "DEMO-TRB-KALK-5561", manufacturer: "Trittbrett",
    model: "Kalle", variant: "", color: "Petrol",
    mileageKm: 95, condition: "WIE_NEU", purchaseCents: 34800, saleCents: 69900,
    additionalCents: 0, workflow: "IN_PRUEFUNG", sale: "VERFUEGBAR",
    location: "Prüfplatz 1", arrivalDaysAgo: 4, inspection: "teilweise",
    cleaned: false, repairs: [], imageCount: 0,
    shopify: "NICHT_VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "Fast neuwertig, sehr geringe Laufleistung.",
  },
  {
    number: "SK-2026-0039", serial: "DEMO-XM-PRO2-1187", manufacturer: "Xiaomi",
    model: "Mi Scooter Pro 2", variant: "", color: "Schwarz",
    mileageKm: 2130, condition: "GEBRAUCHT", purchaseCents: 16800, saleCents: null,
    additionalCents: 0, workflow: "IN_PRUEFUNG", sale: "VERFUEGBAR",
    location: "Prüfplatz 2", arrivalDaysAgo: 4, inspection: "teilweise",
    cleaned: false, repairs: [], imageCount: 0,
    shopify: "NICHT_VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "Akkukapazität wirkt reduziert, Testfahrt steht aus.",
  },

  // --- Aufbereitung / Reparatur ------------------------------------
  {
    number: "SK-2026-0033", serial: "DEMO-NB-MAXG2-2204", manufacturer: "Segway-Ninebot",
    model: "KickScooter MAX G2", variant: "", color: "Schwarz",
    mileageKm: 560, condition: "GUT", purchaseCents: 38800, saleCents: 79900,
    additionalCents: 500, workflow: "AUFBEREITUNG", sale: "VERFUEGBAR",
    location: "Werkstatt", arrivalDaysAgo: 8, inspection: "mit_mangel",
    cleaned: false,
    repairs: [
      repair("Hinterreifen beschädigt", "Reifen ersetzt", "Reifen 10\" Tubeless", 2490, 45, "ERLEDIGT", 3),
      repair("Bremsbelag hinten am Limit", "Belag getauscht", "Bremsbelagsatz", 1290, 30, "IN_ARBEIT", 2),
    ],
    imageCount: 0,
    shopify: "NICHT_VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "",
  },
  {
    number: "SK-2026-0034", serial: "DEMO-EGR-PRO-3308", manufacturer: "Egret",
    model: "Pro", variant: "", color: "Schwarz",
    mileageKm: 310, condition: "SEHR_GUT", purchaseCents: 40200, saleCents: 89900,
    additionalCents: 0, workflow: "AUFBEREITUNG", sale: "VERFUEGBAR",
    location: "Werkstatt", arrivalDaysAgo: 7, inspection: "bestanden",
    cleaned: false,
    repairs: [
      repair("Klingel fehlt", "Neue Klingel montiert", "Klingel Alu", 690, 10, "ERLEDIGT", 2),
    ],
    imageCount: 0,
    shopify: "NICHT_VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "Nur noch Endreinigung offen.",
  },
  {
    number: "SK-2026-0035", serial: "DEMO-NIU-KQI2-8845", manufacturer: "NIU",
    model: "KQi2 Pro", variant: "", color: "Grau",
    mileageKm: 870, condition: "GUT", purchaseCents: 19800, saleCents: 44900,
    additionalCents: 0, workflow: "AUFBEREITUNG", sale: "VERFUEGBAR",
    location: "Werkstatt", arrivalDaysAgo: 9, inspection: "mit_mangel",
    cleaned: true,
    repairs: [
      repair("Display flackert", "Displayeinheit getauscht", "Display KQi2", 3490, 60, "OFFEN", 1),
    ],
    imageCount: 0,
    shopify: "NICHT_VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "Ersatzteil bestellt, Lieferung offen.",
  },

  // --- Verkaufsbereit, noch nicht inseriert -------------------------
  {
    number: "SK-2026-0029", serial: "DEMO-XM4-6612", manufacturer: "Xiaomi",
    model: "Electric Scooter 4", variant: "", color: "Schwarz",
    mileageKm: 640, condition: "SEHR_GUT", purchaseCents: 21900, saleCents: 49900,
    additionalCents: 0, workflow: "VERKAUFSBEREIT", sale: "VERFUEGBAR",
    location: "Lager A / Regal 2", arrivalDaysAgo: 14, inspection: "bestanden",
    cleaned: true, repairs: [], imageCount: 3,
    shopify: "NICHT_VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "Bereit zur Veröffentlichung.",
  },
  {
    number: "SK-2026-0030", serial: "DEMO-TRB-PAUL-7729", manufacturer: "Trittbrett",
    model: "Paul", variant: "", color: "Sand",
    mileageKm: 220, condition: "WIE_NEU", purchaseCents: 39900, saleCents: 84900,
    additionalCents: 0, workflow: "VERKAUFSBEREIT", sale: "VERFUEGBAR",
    location: "Lager A / Regal 2", arrivalDaysAgo: 12, inspection: "bestanden",
    cleaned: true, repairs: [], imageCount: 4,
    shopify: "NICHT_VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "",
  },

  // --- Inseriert (Shopify) -----------------------------------------
  {
    number: "SK-2026-0021", serial: "DEMO-NB-MAXG30-1140", manufacturer: "Segway-Ninebot",
    model: "KickScooter MAX G30D", variant: "II", color: "Schwarz",
    mileageKm: 1890, condition: "GUT", purchaseCents: 27500, saleCents: 59900,
    additionalCents: 0, workflow: "VERKAUFSBEREIT", sale: "VERFUEGBAR",
    location: "Lager B / Regal 1", arrivalDaysAgo: 21, inspection: "bestanden",
    cleaned: true,
    repairs: [repair("Schutzblech locker", "Verschraubung erneuert", "Schraubensatz", 290, 15, "ERLEDIGT", 16)],
    imageCount: 4,
    shopify: "VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "",
  },
  {
    number: "SK-2026-0022", serial: "DEMO-XM3-3390", manufacturer: "Xiaomi",
    model: "Mi Scooter 3", variant: "", color: "Schwarz",
    mileageKm: 1420, condition: "GUT", purchaseCents: 15900, saleCents: 36900,
    additionalCents: 0, workflow: "VERKAUFSBEREIT", sale: "VERFUEGBAR",
    location: "Lager B / Regal 1", arrivalDaysAgo: 23, inspection: "bestanden",
    cleaned: true, repairs: [], imageCount: 3,
    shopify: "VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "",
  },

  // --- Inseriert auf beiden Kanälen --------------------------------
  {
    number: "SK-2026-0023", serial: "DEMO-EGR-X-6640", manufacturer: "Egret",
    model: "X", variant: "", color: "Anthrazit",
    mileageKm: 180, condition: "WIE_NEU", purchaseCents: 45500, saleCents: 99900,
    additionalCents: 0, workflow: "VERKAUFSBEREIT", sale: "VERFUEGBAR",
    location: "Lager A / Regal 1", arrivalDaysAgo: 18, inspection: "bestanden",
    cleaned: true, repairs: [], imageCount: 5,
    shopify: "VEROEFFENTLICHT", kleinanzeigen: "VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "Topzustand, beide Kanäle aktiv.",
  },
  {
    number: "SK-2026-0024", serial: "DEMO-NIU-KQI3MAX-2218", manufacturer: "NIU",
    model: "KQi3 Max", variant: "", color: "Schwarz",
    mileageKm: 760, condition: "SEHR_GUT", purchaseCents: 31900, saleCents: 69900,
    additionalCents: 0, workflow: "VERKAUFSBEREIT", sale: "VERFUEGBAR",
    location: "Lager A / Regal 1", arrivalDaysAgo: 19, inspection: "bestanden",
    cleaned: true, repairs: [], imageCount: 4,
    shopify: "VEROEFFENTLICHT", kleinanzeigen: "VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "",
  },
  {
    number: "SK-2026-0025", serial: "DEMO-NB-E2PLUS-5503", manufacturer: "Segway-Ninebot",
    model: "KickScooter E2 Plus", variant: "", color: "Weiß",
    mileageKm: 340, condition: "SEHR_GUT", purchaseCents: 14900, saleCents: 32900,
    additionalCents: 0, workflow: "VERKAUFSBEREIT", sale: "VERFUEGBAR",
    location: "Lager B / Regal 2", arrivalDaysAgo: 17, inspection: "bestanden",
    cleaned: true, repairs: [], imageCount: 3,
    shopify: "VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "",
  },
  {
    number: "SK-2026-0026", serial: "DEMO-XM4P-9081", manufacturer: "Xiaomi",
    model: "Electric Scooter 4 Pro", variant: "", color: "Schwarz",
    mileageKm: 990, condition: "GUT", purchaseCents: 24900, saleCents: 54900,
    additionalCents: 0, workflow: "VERKAUFSBEREIT", sale: "VERFUEGBAR",
    location: "Lager B / Regal 2", arrivalDaysAgo: 20, inspection: "bestanden",
    cleaned: true, repairs: [], imageCount: 3,
    shopify: "VEROEFFENTLICHT", kleinanzeigen: "VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "",
  },

  // --- Listing mit Fehlerzustand (für die Fehlerdarstellung) --------
  {
    number: "SK-2026-0027", serial: "DEMO-TRB-KALK-4417", manufacturer: "Trittbrett",
    model: "Kalle", variant: "", color: "Schwarz",
    mileageKm: 430, condition: "SEHR_GUT", purchaseCents: 33900, saleCents: 74900,
    additionalCents: 0, workflow: "VERKAUFSBEREIT", sale: "VERFUEGBAR",
    location: "Lager A / Regal 3", arrivalDaysAgo: 15, inspection: "bestanden",
    cleaned: true, repairs: [], imageCount: 3,
    shopify: "FEHLER", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "",
  },

  // --- Reserviert ---------------------------------------------------
  {
    number: "SK-2026-0018", serial: "DEMO-NB-MAXG2-7712", manufacturer: "Segway-Ninebot",
    model: "KickScooter MAX G2", variant: "", color: "Grau",
    mileageKm: 520, condition: "SEHR_GUT", purchaseCents: 37900, saleCents: 82900,
    additionalCents: 0, workflow: "VERKAUFSBEREIT", sale: "RESERVIERT",
    location: "Lager A / Regal 1", arrivalDaysAgo: 26, inspection: "bestanden",
    cleaned: true, repairs: [], imageCount: 4,
    shopify: "VEROEFFENTLICHT", kleinanzeigen: "VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "Kunde holt Freitag ab, Anzahlung erhalten.",
  },
  {
    number: "SK-2026-0019", serial: "DEMO-XM4U-2265", manufacturer: "Xiaomi",
    model: "Electric Scooter 4 Ultra", variant: "", color: "Schwarz",
    mileageKm: 280, condition: "WIE_NEU", purchaseCents: 30900, saleCents: 67900,
    additionalCents: 0, workflow: "VERKAUFSBEREIT", sale: "RESERVIERT",
    location: "Lager A / Regal 1", arrivalDaysAgo: 24, inspection: "bestanden",
    cleaned: true, repairs: [], imageCount: 4,
    shopify: "VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "Reservierung bis Montag.",
  },
  {
    number: "SK-2026-0020", serial: "DEMO-NIU-KQI3-4471", manufacturer: "NIU",
    model: "KQi3 Pro", variant: "", color: "Rot",
    mileageKm: 1100, condition: "GUT", purchaseCents: 24500, saleCents: 52900,
    additionalCents: 0, workflow: "VERKAUFSBEREIT", sale: "RESERVIERT",
    location: "Lager B / Regal 1", arrivalDaysAgo: 22, inspection: "bestanden",
    cleaned: true, repairs: [], imageCount: 3,
    shopify: "VEROEFFENTLICHT", kleinanzeigen: "NICHT_VEROEFFENTLICHT",
    abe: true, invoice: true, notes: "",
  },
]

/** Verkaufte Scooter — Basis für Verkaufsliste, Umsatz und Marge. */
interface SoldSpec {
  number: string
  serial: string
  manufacturer: string
  model: string
  color: string
  mileageKm: number
  purchaseCents: number
  saleCents: number
  repairCents: number
  channel: SaleChannel
  soldAt: string
  sheets: Sale["sheetsSyncStatus"]
}

const SOLD_SPECS: SoldSpec[] = [
  { number: "SK-2026-0017", serial: "DEMO-XM4-1102", manufacturer: "Xiaomi", model: "Electric Scooter 4", color: "Schwarz", mileageKm: 720, purchaseCents: 21500, saleCents: 48900, repairCents: 1290, channel: "SHOPIFY", soldAt: thisMonth(2), sheets: "SYNCHRONISIERT" },
  { number: "SK-2026-0016", serial: "DEMO-NB-F2-9938", manufacturer: "Segway-Ninebot", model: "KickScooter F2", color: "Grau", mileageKm: 1340, purchaseCents: 18900, saleCents: 41900, repairCents: 0, channel: "KLEINANZEIGEN", soldAt: thisMonth(3), sheets: "SYNCHRONISIERT" },
  { number: "SK-2026-0015", serial: "DEMO-EGR-PRO-2214", manufacturer: "Egret", model: "Pro", color: "Schwarz", mileageKm: 410, purchaseCents: 39900, saleCents: 87900, repairCents: 2490, channel: "SHOPIFY", soldAt: thisMonth(5), sheets: "SYNCHRONISIERT" },
  { number: "SK-2026-0014", serial: "DEMO-NIU-KQI3-6605", manufacturer: "NIU", model: "KQi3 Pro", color: "Weiß", mileageKm: 980, purchaseCents: 24900, saleCents: 53900, repairCents: 690, channel: "VOR_ORT", soldAt: thisMonth(7), sheets: "SYNCHRONISIERT" },
  { number: "SK-2026-0013", serial: "DEMO-XM3-7781", manufacturer: "Xiaomi", model: "Mi Scooter 3", color: "Schwarz", mileageKm: 1670, purchaseCents: 15500, saleCents: 35900, repairCents: 1890, channel: "SHOPIFY", soldAt: thisMonth(9), sheets: "SYNCHRONISIERT" },
  { number: "SK-2026-0012", serial: "DEMO-TRB-KALK-3302", manufacturer: "Trittbrett", model: "Kalle", color: "Petrol", mileageKm: 260, purchaseCents: 34500, saleCents: 76900, repairCents: 0, channel: "KLEINANZEIGEN", soldAt: thisMonth(11), sheets: "SYNCHRONISIERT" },
  { number: "SK-2026-0011", serial: "DEMO-NB-MAXG30-8820", manufacturer: "Segway-Ninebot", model: "KickScooter MAX G30", color: "Schwarz", mileageKm: 2210, purchaseCents: 25900, saleCents: 55900, repairCents: 3290, channel: "SHOPIFY", soldAt: thisMonth(13), sheets: "SYNCHRONISIERT" },
  // Ein Verkauf, dessen Reporting-Sync fehlgeschlagen ist — der Fehler bleibt
  // sichtbar und ist auf der Verkaufsseite manuell wiederholbar.
  { number: "SK-2026-0010", serial: "DEMO-XM4P-5514", manufacturer: "Xiaomi", model: "Electric Scooter 4 Pro", color: "Schwarz", mileageKm: 840, purchaseCents: 23900, saleCents: 52900, repairCents: 0, channel: "TELEFON", soldAt: thisMonth(15), sheets: "FEHLER" },
  { number: "SK-2026-0009", serial: "DEMO-NIU-KQI2-1193", manufacturer: "NIU", model: "KQi2 Pro", color: "Grau", mileageKm: 1520, purchaseCents: 18500, saleCents: 42900, repairCents: 990, channel: "SHOPIFY", soldAt: lastMonth(24), sheets: "SYNCHRONISIERT" },
  { number: "SK-2026-0008", serial: "DEMO-EGR-X-4408", manufacturer: "Egret", model: "X", color: "Anthrazit", mileageKm: 350, purchaseCents: 44900, saleCents: 96900, repairCents: 0, channel: "KLEINANZEIGEN", soldAt: lastMonth(19), sheets: "SYNCHRONISIERT" },
]

/* ------------------------------------------------------------------ */
/* Aufbau                                                              */
/* ------------------------------------------------------------------ */

function buildScooter(spec: ScooterSpec, index: number): Scooter {
  const label = [spec.manufacturer, spec.model, spec.variant]
    .filter(Boolean)
    .join(" ")
  const arrival = daysAgo(spec.arrivalDaysAgo, 8, 30)
  const inspection = buildInspection(
    spec.inspection,
    Math.max(1, spec.arrivalDaysAgo - 2)
  )

  return {
    id: seedId("sct"),
    scooterNumber: spec.number,
    serialNumber: spec.serial,
    manufacturer: spec.manufacturer,
    model: spec.model,
    variant: spec.variant,
    color: spec.color,
    mileageKm: spec.mileageKm,
    condition: spec.condition,
    description:
      spec.condition === "WIE_NEU"
        ? `${label} in nahezu neuwertigem Zustand. Geprüft, gereinigt und fahrbereit übergeben.`
        : `Gebrauchter ${label}. Vollständig geprüft und aufbereitet, Verschleißteile kontrolliert.`,
    technicalData: [
      { key: "Motorleistung", value: spec.manufacturer === "Egret" ? "500 W" : "300 W" },
      { key: "Höchstgeschwindigkeit", value: "20 km/h" },
      { key: "Reichweite (Herstellerangabe)", value: spec.condition === "WIE_NEU" ? "45 km" : "30 km" },
      { key: "Gewicht", value: "16,5 kg" },
      { key: "Straßenzulassung", value: spec.abe ? "ABE vorhanden" : "ABE fehlt" },
    ],
    purchasePriceCents: spec.purchaseCents,
    additionalCostsCents: spec.additionalCents,
    salePriceCents: spec.saleCents,
    purchaseDate: daysAgo(spec.arrivalDaysAgo + 3, 9, 0),
    arrivalDate: arrival,
    location: spec.location,
    notes: spec.notes,
    workflowStatus: spec.workflow,
    saleStatus: spec.sale,
    documents: {
      abe: spec.abe,
      invoice: spec.invoice,
      other: false,
      note: spec.abe ? "" : "ABE nachfordern.",
    },
    inspection,
    cleaning: {
      done: spec.cleaned,
      doneAt: spec.cleaned ? daysAgo(Math.max(1, spec.arrivalDaysAgo - 4)) : null,
      note: "",
    },
    repairs: spec.repairs,
    images: spec.imageCount > 0 ? buildImages(label, spec.imageCount, index * 3) : [],
    listings: [
      buildListing(
        "SHOPIFY",
        spec.shopify,
        spec.saleCents,
        spec.shopify === "FEHLER"
          ? {
              lastError:
                "Shopify Admin API nicht erreichbar (HTTP 503). Veröffentlichung abgebrochen.",
              retryCount: 2,
              inventory: 0,
            }
          : {}
      ),
      buildListing("KLEINANZEIGEN", spec.kleinanzeigen, spec.saleCents),
    ],
    importBatchId: null,
    createdAt: arrival,
    updatedAt: daysAgo(Math.max(0, spec.arrivalDaysAgo - 5), 15, 20),
  }
}

function buildSoldScooter(spec: SoldSpec): { scooter: Scooter; sale: Sale } {
  const label = `${spec.manufacturer} ${spec.model}`
  const inspection = buildInspection("bestanden", 40)

  const repairs: Repair[] =
    spec.repairCents > 0
      ? [
          repair(
            "Verschleißteil ersetzt",
            "Im Rahmen der Aufbereitung getauscht",
            "Verschleißteilsatz",
            spec.repairCents,
            30,
            "ERLEDIGT",
            40
          ),
        ]
      : []

  const scooter: Scooter = {
    id: seedId("sct"),
    scooterNumber: spec.number,
    serialNumber: spec.serial,
    manufacturer: spec.manufacturer,
    model: spec.model,
    variant: "",
    color: spec.color,
    mileageKm: spec.mileageKm,
    condition: "SEHR_GUT",
    description: `Gebrauchter ${label}. Geprüft und aufbereitet.`,
    technicalData: [
      { key: "Höchstgeschwindigkeit", value: "20 km/h" },
      { key: "Straßenzulassung", value: "ABE vorhanden" },
    ],
    purchasePriceCents: spec.purchaseCents,
    additionalCostsCents: 0,
    salePriceCents: spec.saleCents,
    purchaseDate: daysAgo(60, 9, 0),
    arrivalDate: daysAgo(55, 9, 0),
    location: "Versand",
    notes: "",
    workflowStatus: "ARCHIVIERT",
    saleStatus: "VERKAUFT",
    documents: { abe: true, invoice: true, other: false, note: "" },
    inspection,
    cleaning: { done: true, doneAt: daysAgo(50), note: "" },
    repairs,
    images: buildImages(label, 2, 40),
    listings: [
      buildListing("SHOPIFY", "DEAKTIVIERT", spec.saleCents, { inventory: 0 }),
      buildListing("KLEINANZEIGEN", "DEAKTIVIERT", spec.saleCents, { inventory: 0 }),
    ],
    importBatchId: null,
    createdAt: daysAgo(55, 9, 0),
    updatedAt: spec.soldAt,
  }

  const sale: Sale = {
    id: seedId("sale"),
    scooterId: scooter.id,
    scooterNumber: scooter.scooterNumber,
    modelLabel: modelLabel(scooter),
    serialNumber: scooter.serialNumber,
    channel: spec.channel,
    salePriceCents: spec.saleCents,
    purchasePriceCents: spec.purchaseCents,
    repairCostsCents: repairCostsCents(scooter),
    additionalCostsCents: 0,
    soldAt: spec.soldAt,
    note: "",
    sheetsSyncStatus: spec.sheets,
    sheetsSyncedAt: spec.sheets === "SYNCHRONISIERT" ? spec.soldAt : null,
    sheetsError:
      spec.sheets === "FEHLER"
        ? "Google Sheets API nicht erreichbar. Zeile wurde nicht geschrieben."
        : null,
    createdAt: spec.soldAt,
  }

  return { scooter, sale }
}

/* ------------------------------------------------------------------ */
/* Aktivitäten                                                         */
/* ------------------------------------------------------------------ */

function buildActivity(scooters: Scooter[], sales: Sale[]): AuditEvent[] {
  const events: AuditEvent[] = []

  function push(
    event: Omit<AuditEvent, "id"> & Partial<Pick<AuditEvent, "id">>
  ) {
    events.push({ id: seedId("evt"), ...event } as AuditEvent)
  }

  for (const scooter of scooters.slice(0, 12)) {
    push({
      at: scooter.createdAt,
      actor: "M. Traut",
      category: "SCOOTER",
      action: "Scooter erstellt",
      detail: `${modelLabel(scooter)} im Wareneingang erfasst.`,
      scooterId: scooter.id,
      scooterNumber: scooter.scooterNumber,
      level: "info",
    })

    if (scooter.inspection.completedAt) {
      push({
        at: scooter.inspection.completedAt,
        actor: scooter.inspection.completedBy ?? "M. Traut",
        category: "PRUEFUNG",
        action: "Prüfung abgeschlossen",
        detail:
          scooter.inspection.checks.filter((c) => c.result === "PROBLEM").length > 0
            ? "Mängel dokumentiert, Reparatur erforderlich."
            : "Alle Prüfpunkte ohne Beanstandung.",
        scooterId: scooter.id,
        scooterNumber: scooter.scooterNumber,
        level:
          scooter.inspection.checks.some((c) => c.result === "PROBLEM")
            ? "warning"
            : "success",
      })
    }

    const shopify = scooter.listings.find((l) => l.channel === "SHOPIFY")
    if (shopify?.status === "VEROEFFENTLICHT" && shopify.lastSyncedAt) {
      push({
        at: shopify.lastSyncedAt,
        actor: "M. Traut",
        category: "KANAL",
        action: "Auf Shopify veröffentlicht",
        detail: `Produkt angelegt, Bestand 1.`,
        scooterId: scooter.id,
        scooterNumber: scooter.scooterNumber,
        level: "success",
      })
    }
    if (shopify?.status === "FEHLER") {
      push({
        at: shopify.lastSyncedAt ?? scooter.updatedAt,
        actor: "System",
        category: "KANAL",
        action: "Shopify-Veröffentlichung fehlgeschlagen",
        detail: shopify.lastError ?? "Unbekannter Fehler.",
        scooterId: scooter.id,
        scooterNumber: scooter.scooterNumber,
        level: "error",
      })
    }
  }

  for (const sale of sales) {
    push({
      at: sale.soldAt,
      actor: sale.channel === "SHOPIFY" ? "System (Shopify Webhook)" : "M. Traut",
      category: "VERKAUF",
      action: "Als verkauft markiert",
      detail: `${sale.modelLabel} über ${sale.channel === "VOR_ORT" ? "Vor Ort" : sale.channel} verkauft.`,
      scooterId: sale.scooterId,
      scooterNumber: sale.scooterNumber,
      level: "success",
    })

    if (sale.sheetsSyncStatus === "SYNCHRONISIERT" && sale.sheetsSyncedAt) {
      push({
        at: sale.sheetsSyncedAt,
        actor: "System",
        category: "SYNC",
        action: "Google Sheets synchronisiert",
        detail: "Verkaufszeile in die Umsatztabelle geschrieben.",
        scooterId: sale.scooterId,
        scooterNumber: sale.scooterNumber,
        level: "success",
      })
    }
    if (sale.sheetsSyncStatus === "FEHLER") {
      push({
        at: sale.soldAt,
        actor: "System",
        category: "SYNC",
        action: "Google-Sheets-Synchronisation fehlgeschlagen",
        detail: sale.sheetsError ?? "Unbekannter Fehler.",
        scooterId: sale.scooterId,
        scooterNumber: sale.scooterNumber,
        level: "error",
      })
    }
  }

  return events.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  )
}

/* ------------------------------------------------------------------ */
/* Öffentliche API                                                     */
/* ------------------------------------------------------------------ */

export interface SeedData {
  scooters: Scooter[]
  sales: Sale[]
  activity: AuditEvent[]
  importBatches: ImportBatch[]
}

export function createSeedData(): SeedData {
  idCounter = 0

  const inStock = SPECS.map(buildScooter)
  const sold = SOLD_SPECS.map(buildSoldScooter)

  const scooters = [...inStock, ...sold.map((entry) => entry.scooter)]
  const sales = sold
    .map((entry) => entry.sale)
    .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime())

  const importBatches: ImportBatch[] = [
    {
      id: seedId("imp"),
      fileName: "avides_lieferung_kw31.csv",
      source: "DATEI",
      rowsTotal: 12,
      rowsImported: 11,
      rowsSkipped: 1,
      issues: [
        {
          row: 8,
          serialNumber: "DEMO-XM4U-77301",
          reason: "Seriennummer bereits im Bestand vorhanden (SK-2026-0041).",
          severity: "warning",
        },
      ],
      createdAt: daysAgo(2, 9, 15),
      createdBy: "M. Traut",
    },
  ]

  return {
    scooters,
    sales,
    activity: buildActivity(scooters, sales),
    importBatches,
  }
}

/** Prüft in Tests und beim Reset, ob der Seed in sich stimmig ist. */
export const SEED_SIGNATURE = "skope-demo-seed-v1"
